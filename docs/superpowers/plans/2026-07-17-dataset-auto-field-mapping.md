# 数据集自动字段映射 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** XLSX 上传自动检查首个工作表，并在字段映射页基于中英文标准字段安全地预选一对一映射。

**Architecture:** 新增纯前端映射建议函数，负责规范化比较和歧义剔除，不触碰 Worker、D1 或 LLM。上传页在取得工作表目录后选择并检查第一个工作表；映射页仅将建议作为初始表单值，既有保存与校验流程保持不变。

**Tech Stack:** React 19、TypeScript、Vitest、Testing Library、React Router。

## Global Constraints

- 使用 TypeScript ESM、严格类型与两空格缩进。
- 不对字段作兜底；没有唯一匹配时必须保持未映射。
- 非直观的函数和业务规则添加简洁中文注释。
- 不新增 API、数据库结构或 LLM 调用。

---

### Task 1: 实现可测试的自动映射建议函数

**Files:**
- Create: `apps/web/src/features/datasets/field-mapping.ts`
- Create: `apps/web/src/features/datasets/field-mapping.test.ts`

**Interfaces:**
- Consumes: `sourceFields: string[]`、`templateFields: FieldDefinition[]`。
- Produces: `createSuggestedTargets(sourceFields, templateFields): Record<string, string>`，键为来源字段、值为唯一命中的标准字段 `name`。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'vitest'

import { createSuggestedTargets } from './field-mapping'

const fields = [
  { name: 'sales_amount', type: 'number' as const, description: '销售金额', required: true },
  { name: 'customer_name', type: 'string' as const, description: '客户名称', required: true },
]

describe('createSuggestedTargets', () => {
  it('按中文说明和规范化英文名称预选唯一映射', () => {
    expect(createSuggestedTargets(['销售金额', 'Customer Name'], fields)).toEqual({
      销售金额: 'sales_amount',
      'Customer Name': 'customer_name',
    })
  })

  it('歧义或重复命中时不生成映射', () => {
    expect(createSuggestedTargets(['销售金额', '销售 金额'], [
      { name: 'sales_amount', type: 'number', description: '销售金额', required: true },
    ])).toEqual({})
  })
})
```

- [ ] **Step 2: 确认测试失败**

Run: `pnpm --filter @data-analyze/web test -- src/features/datasets/field-mapping.test.ts`  
Expected: FAIL，原因是模块或 `createSuggestedTargets` 尚不存在。

- [ ] **Step 3: 实现最小映射规则**

```ts
import type { FieldDefinition } from '@data-analyze/contracts'

function normalizeFieldLabel(value: string) {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, '')
}

export function createSuggestedTargets(sourceFields: string[], templateFields: FieldDefinition[]) {
  const candidates = sourceFields.map((sourceField) => {
    const normalizedSource = normalizeFieldLabel(sourceField)
    const matches = templateFields.filter((field) =>
      [field.name, field.description].some((label) => normalizeFieldLabel(label) === normalizedSource),
    )
    return { sourceField, targetName: matches.length === 1 ? matches[0].name : undefined }
  })
  const targetCounts = new Map<string, number>()
  candidates.forEach(({ targetName }) => {
    if (targetName) targetCounts.set(targetName, (targetCounts.get(targetName) || 0) + 1)
  })
  return Object.fromEntries(candidates.flatMap(({ sourceField, targetName }) =>
    targetName && targetCounts.get(targetName) === 1 ? [[sourceField, targetName]] : [],
  ))
}
```

- [ ] **Step 4: 确认测试通过**

Run: `pnpm --filter @data-analyze/web test -- src/features/datasets/field-mapping.test.ts`  
Expected: PASS，两个断言均通过。

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/features/datasets/field-mapping.ts apps/web/src/features/datasets/field-mapping.test.ts
git commit -m "feat(datasets): suggest unambiguous field mappings"
```

### Task 2: 将建议映射接入字段映射页面

**Files:**
- Modify: `apps/web/src/features/datasets/FieldMappingPage.tsx:1-35`
- Modify: `apps/web/src/features/datasets/FieldMappingPage.test.tsx`

**Interfaces:**
- Consumes: Task 1 的 `createSuggestedTargets`。
- Produces: `FieldMappingForm` 初始 `targets` 为唯一自动匹配项；用户仍可通过下拉框覆盖。

- [ ] **Step 1: 写失败组件测试**

```tsx
it('首次渲染时预选中文说明匹配的标准字段', () => {
  render(<FieldMappingPage template={template} inspection={inspection} versionId="v1" />)
  expect(screen.getByRole('combobox', { name: '销售额 对应标准字段' }))
    .toHaveValue('salesAmount')
})
```

- [ ] **Step 2: 确认测试失败**

Run: `pnpm --filter @data-analyze/web test -- src/features/datasets/FieldMappingPage.test.tsx`  
Expected: FAIL，当前下拉框初始值为空字符串。

- [ ] **Step 3: 使用建议作为表单初始状态**

```tsx
import { createSuggestedTargets } from './field-mapping'

function FieldMappingForm({ template, inspection, versionId, onConfirm }: FieldMappingProps) {
  const [targets, setTargets] = useState(() =>
    createSuggestedTargets(inspection.sourceFields, template.fields),
  )
```

保留现有 `onChange`、必填校验、重复目标校验及保存调用；不在页面中对未命中字段补值。

- [ ] **Step 4: 确认组件测试通过**

Run: `pnpm --filter @data-analyze/web test -- src/features/datasets/FieldMappingPage.test.tsx`  
Expected: PASS，自动匹配字段已选中，原有必填校验测试继续通过。

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/features/datasets/FieldMappingPage.tsx apps/web/src/features/datasets/FieldMappingPage.test.tsx
git commit -m "feat(datasets): preselect suggested field mappings"
```

### Task 3: XLSX 上传后自动检查第一个工作表

**Files:**
- Modify: `apps/web/src/features/datasets/DatasetUploadPage.tsx:33-51`
- Create: `apps/web/src/features/datasets/DatasetUploadPage.test.tsx`

**Interfaces:**
- Consumes: 检查 API 的 `{ status: 'awaiting_sheet'; sheets: string[] }`。
- Produces: 首表检查请求 `POST /api/datasets/:versionId/inspect`，请求体 `{ selectedSheet: sheets[0] }`；检查成功后沿用既有导航状态。

- [ ] **Step 1: 写失败页面测试**

```tsx
it('Excel 返回多个工作表时自动检查第一个工作表', async () => {
  const user = userEvent.setup()
  apiRequestMock
    .mockResolvedValueOnce([template])
    .mockResolvedValueOnce({ id: 'd1', versionId: 'v1', status: 'uploaded' })
    .mockResolvedValueOnce({ status: 'awaiting_sheet', sheets: ['一月', '二月'] })
    .mockResolvedValueOnce({ status: 'inspected', inspection })

  render(<DatasetUploadPage />)
  await user.selectOptions(screen.getByLabelText('分析模板'), template.id)
  await user.upload(
    screen.getByLabelText('CSV 或 XLSX 文件'),
    new File(['xlsx-content'], '销售.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  )
  await user.click(screen.getByRole('button', { name: '上传并检查' }))
  await waitFor(() => expect(apiRequestMock).toHaveBeenLastCalledWith(
    '/api/datasets/v1/inspect',
    expect.objectContaining({ body: JSON.stringify({ selectedSheet: '一月' }) }),
  ))
})
```

- [ ] **Step 2: 确认测试失败**

Run: `pnpm --filter @data-analyze/web test -- src/features/datasets/DatasetUploadPage.test.tsx`  
Expected: FAIL，当前实现只显示工作表选择器，不会发起第二次检查。

- [ ] **Step 3: 在目录返回时选择并检查首工作表**

```ts
if (result.status === 'awaiting_sheet') {
  const firstSheet = result.sheets[0]
  if (!firstSheet) throw new Error('WORKBOOK_SHEET_MISSING')
  setPendingVersionId(versionId)
  setSheets(result.sheets)
  setSelectedSheet(firstSheet)
  await inspect(versionId, firstSheet)
  return
}
```

保留原工作表选择器作为异常恢复入口；正常路径成功导航后不再要求用户额外点击“检查所选工作表”。

- [ ] **Step 4: 确认页面测试通过**

Run: `pnpm --filter @data-analyze/web test -- src/features/datasets/DatasetUploadPage.test.tsx`  
Expected: PASS，第二次检查使用“一月”，并调用现有映射页导航。

- [ ] **Step 5: 完整验证并提交**

```bash
pnpm --filter @data-analyze/web test -- src/features/datasets
pnpm typecheck
pnpm build
git add apps/web/src/features/datasets/DatasetUploadPage.tsx apps/web/src/features/datasets/DatasetUploadPage.test.tsx
git commit -m "feat(datasets): inspect first workbook sheet by default"
```

Expected: 测试、类型检查和构建均通过。
