import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ScriptUploadPage } from './ScriptUploadPage'

const source = `export const metadata = {
  id: 'regional-sales',
  version: '1.1.0',
}
export const script = { metadata }
`

describe('ScriptUploadPage', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('提交前显示完整源码和目标路径，提交后显示 R2 草稿位置', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({
        id: 'draft-1',
        objectKey: 'data-analyze/script-drafts/draft-1/source.ts',
        status: 'stored',
      }), { status: 201 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    render(<ScriptUploadPage />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('脚本 ID'), 'regional-sales')
    await user.type(screen.getByLabelText('版本'), '1.1.0')
    await user.upload(screen.getByLabelText('TypeScript 源码'), new File([source], 'regional-sales.ts', { type: 'text/typescript' }))

    expect(screen.getByText('packages/scripts/src/regional-sales/1.1.0.ts')).toBeVisible()
    expect(screen.getByRole('code')).toHaveTextContent("export const metadata = { id: 'regional-sales', version: '1.1.0', }")
    await user.click(screen.getByRole('button', { name: '保存候选源码' }))
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(await screen.findByText('data-analyze/script-drafts/draft-1/source.ts')).toBeVisible()
    expect(screen.queryByRole('link', { name: /Pull Request/ })).not.toBeInTheDocument()
  })
})
