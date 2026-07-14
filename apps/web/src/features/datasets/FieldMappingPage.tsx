import { useMemo, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'

import type { DatasetInspection, FieldDefinition, FieldMapping } from '@data-analyze/contracts'

import { saveFieldMapping } from '../../api/client'

type MappingTemplate = {
  id: string
  name: string
  fields: FieldDefinition[]
}

type FieldMappingProps = {
  template: MappingTemplate
  inspection: DatasetInspection
  versionId: string
  onConfirm?: (mappings: FieldMapping[]) => Promise<void> | void
}

type MappingRouteState = {
  template: MappingTemplate
  inspection: DatasetInspection
}

function FieldMappingForm({ template, inspection, versionId, onConfirm }: FieldMappingProps) {
  const [targets, setTargets] = useState<Record<string, string>>({})
  const [status, setStatus] = useState('')

  const mappings = useMemo(
    () =>
      inspection.sourceFields.flatMap((sourceField) => {
        const targetField = targets[sourceField]
        return targetField ? [{ sourceField, targetField }] : []
      }),
    [inspection.sourceFields, targets],
  )
  const mappedTargets = new Set(mappings.map((mapping) => mapping.targetField))
  const missingRequired = template.fields
    .filter((field) => field.required && !mappedTargets.has(field.name))
    .map((field) => field.name)
  const duplicateTargets = mappedTargets.size !== mappings.length
  const canConfirm = missingRequired.length === 0 && !duplicateTargets

  async function confirm() {
    setStatus('')
    try {
      if (onConfirm) await onConfirm(mappings)
      else await saveFieldMapping(versionId, mappings)
      setStatus('字段映射已保存')
    } catch {
      setStatus('字段映射保存失败')
    }
  }

  return (
    <section className="panel stack">
      <h2>确认字段映射：{template.name}</h2>
      <table>
        <thead><tr><th>来源字段</th><th>标准字段</th></tr></thead>
        <tbody>
          {inspection.sourceFields.map((sourceField) => (
            <tr key={sourceField}>
              <td>{sourceField}</td>
              <td>
                <select aria-label={`${sourceField} 对应标准字段`} value={targets[sourceField] ?? ''} onChange={(event) => setTargets((current) => ({ ...current, [sourceField]: event.target.value }))}>
                  <option value="">忽略</option>
                  {template.fields.map((field) => <option key={field.name} value={field.name}>{field.name}（{field.description}）</option>)}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {missingRequired.length > 0 ? <p className="error">未映射必填字段：{missingRequired.join('、')}</p> : null}
      {duplicateTargets ? <p className="error">同一个标准字段不能被重复映射</p> : null}
      {status && <p className={status.endsWith('失败') ? 'error' : 'success'}>{status}</p>}
      <button type="button" disabled={!canConfirm} onClick={confirm}>确认字段映射</button>
    </section>
  )
}

function RoutedFieldMappingPage() {
  const { versionId } = useParams()
  const location = useLocation()
  const state = location.state as MappingRouteState | null
  if (!versionId || !state) {
    return <p className="error">缺少字段映射所需的数据集结构，请重新上传并检查文件。</p>
  }
  return <FieldMappingForm versionId={versionId} template={state.template} inspection={state.inspection} />
}

export function FieldMappingPage(props: FieldMappingProps | Record<string, never>) {
  return hasMappingProps(props) ? <FieldMappingForm {...props} /> : <RoutedFieldMappingPage />
}

function hasMappingProps(
  props: FieldMappingProps | Record<string, never>,
): props is FieldMappingProps {
  return 'template' in props && 'inspection' in props && 'versionId' in props
}
