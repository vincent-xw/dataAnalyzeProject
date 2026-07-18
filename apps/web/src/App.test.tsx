import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { App } from './App'

describe('App', () => {
  it('展示深色顶部导航、产品名称和既有导航链接', () => {
    render(
      <MemoryRouter initialEntries={['/analyses']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByRole('banner')).toHaveClass('app-header')
    expect(screen.getByRole('heading', { name: '数据分析 Agent' })).toBeVisible()
    expect(screen.getByRole('navigation', { name: '主导航' })).toBeVisible()
    expect(screen.getByRole('link', { name: '我的数据' })).toHaveAttribute('href', '/assets')
    expect(screen.getByRole('link', { name: '数据分析' })).toHaveAttribute('href', '/analyses')
    expect(screen.getByRole('link', { name: '系统设置' })).toHaveAttribute('href', '/settings')
    expect(screen.getByRole('link', { name: '上传数据' })).toHaveAttribute('href', '/assets/upload')
    expect(screen.getByRole('contentinfo')).toHaveTextContent('数据分析 Agent')
  })
})
