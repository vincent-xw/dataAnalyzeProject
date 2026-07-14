import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { App } from './App'

describe('App', () => {
  it('展示产品名称', () => {
    render(<App />)

    expect(screen.getByRole('main')).toHaveTextContent('数据分析 Agent')
  })
})
