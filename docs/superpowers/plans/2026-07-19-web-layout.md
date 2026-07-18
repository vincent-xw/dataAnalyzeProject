# Web Overall Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the Web app shell to a dark Ant Design top-navigation layout without changing routes, business pages, API calls, or API fields.

**Architecture:** `App` remains the route layout component and owns the Ant Design `Layout`, route-aware `Menu`, and `Outlet`. Global CSS owns the full-height page shell, constrained content area, dark header presentation, footer, and small-screen overflow behavior; feature pages remain untouched.

**Tech Stack:** React 19, React Router 7, Ant Design 6, TypeScript, Vitest, Testing Library, Vite.

## Global Constraints

- Do not modify Worker code, API clients, contracts, route declarations, business page files, request fields, or response-field handling.
- Retain exactly these navigation targets and labels: `/assets` “我的数据”, `/analyses` “数据分析”, `/settings` “系统设置”, `/assets/upload` “上传数据”.
- Use `Layout`, `Header`, `Content`, `Footer`, and a dark horizontal Ant Design `Menu`.
- Header height is 64px; its brand text is white; active menu items have a high-contrast visual state.
- The content background is light gray, content width is capped around 1200px, and the footer stays at the bottom of short pages.
- On narrow screens, the header navigation scrolls horizontally without wrapping or overlapping.

---

### Task 1: Cover the application shell contract

**Files:**
- Modify: `apps/web/src/App.test.tsx`

**Interfaces:**
- Consumes: `App` rendered inside `MemoryRouter`.
- Produces: regression coverage for the application landmark, dark-layout navigation, brand, footer, and all unchanged links.

- [ ] **Step 1: Write the failing test**

Replace the test file with:

```tsx
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @data-analyze/web test -- App.test.tsx`

Expected: FAIL because the current `App` has no `banner` landmark with class `app-header` and no footer.

### Task 2: Implement the route-aware Ant Design application shell

**Files:**
- Modify: `apps/web/src/App.tsx`

**Interfaces:**
- Consumes: React Router `useLocation`, `NavLink`, and `Outlet`; Ant Design `Layout` and `Menu`.
- Produces: `App` with semantic `Header`, `Content`, `Footer`; a route-aware `selectedKeys` value; unchanged links.

- [ ] **Step 1: Replace the application shell implementation**

Replace `apps/web/src/App.tsx` with:

```tsx
import { Layout, Menu } from 'antd'
import { NavLink, Outlet, useLocation } from 'react-router-dom'

const navigationItems = [
  { key: '/assets', label: <NavLink to="/assets">我的数据</NavLink> },
  { key: '/analyses', label: <NavLink to="/analyses">数据分析</NavLink> },
  { key: '/settings', label: <NavLink to="/settings">系统设置</NavLink> },
  { key: '/assets/upload', label: <NavLink to="/assets/upload">上传数据</NavLink> },
]

function getSelectedNavigationKeys(pathname: string) {
  if (pathname.startsWith('/assets/upload')) return ['/assets/upload']
  if (pathname.startsWith('/assets')) return ['/assets']
  if (pathname.startsWith('/analyses')) return ['/analyses']
  if (pathname.startsWith('/settings')) return ['/settings']
  return []
}

export function App() {
  const location = useLocation()

  return (
    <Layout className="app-shell">
      <Layout.Header className="app-header">
        <div className="app-header-inner">
          <h1 className="app-brand">数据分析 Agent</h1>
          <nav className="app-navigation" aria-label="主导航">
            <Menu
              items={navigationItems}
              mode="horizontal"
              selectedKeys={getSelectedNavigationKeys(location.pathname)}
              theme="dark"
            />
          </nav>
        </div>
      </Layout.Header>
      <Layout.Content className="app-content" role="main">
        <div className="app-content-inner">
          <Outlet />
        </div>
      </Layout.Content>
      <Layout.Footer className="app-footer">数据分析 Agent</Layout.Footer>
    </Layout>
  )
}
```

- [ ] **Step 2: Run the focused test to verify it passes**

Run: `pnpm --filter @data-analyze/web test -- App.test.tsx`

Expected: PASS with the App test reporting one passing test.

- [ ] **Step 3: Commit the application-shell change**

```bash
git add apps/web/src/App.tsx apps/web/src/App.test.tsx
git commit -m "feat(web): add ant design application layout"
```

### Task 3: Style the dark header and responsive page frame

**Files:**
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes: `app-shell`, `app-header`, `app-header-inner`, `app-brand`, `app-navigation`, `app-content`, `app-content-inner`, and `app-footer` classes rendered by `App`.
- Produces: full-height top-middle-bottom layout, a dark 64px header, a 1200px constrained content work area, and a no-wrap horizontally scrollable narrow header.

- [ ] **Step 1: Replace the current shell CSS block**

Replace the rules from `body` through the current `nav a.active` rule with:

```css
html,
body,
#root {
  min-height: 100%;
}

body {
  margin: 0;
}

.app-shell {
  min-height: 100vh;
}

.app-header {
  height: 64px;
  padding: 0;
  background: #001529;
}

.app-header-inner {
  display: flex;
  width: min(1180px, calc(100% - 40px));
  height: 64px;
  align-items: center;
  gap: 32px;
  margin: 0 auto;
  overflow-x: auto;
  scrollbar-width: none;
}

.app-header-inner::-webkit-scrollbar {
  display: none;
}

.app-brand {
  flex: 0 0 auto;
  margin: 0;
  color: #fff;
  font-size: 20px;
  letter-spacing: -.02em;
  white-space: nowrap;
}

.app-navigation {
  flex: 0 0 auto;
}

.app-navigation .ant-menu {
  min-width: max-content;
  border-bottom: 0;
  background: transparent;
  line-height: 64px;
}

.app-content {
  display: flex;
  flex: 1;
  background: #f5f7fb;
}

.app-content-inner {
  width: min(1180px, calc(100% - 40px));
  margin: 0 auto;
  padding: 32px 0 64px;
}

.app-footer {
  padding: 18px 20px;
  color: #8b96a7;
  background: #f5f7fb;
  font-size: 13px;
  text-align: center;
}

.row,
.actions {
  display: flex;
  align-items: center;
  gap: 16px;
}
```

Also change `.prompt-dialog header` to include `display: flex;`, because the removed global `header` flex rule previously supplied it. In the narrow-screen media query, replace the `main` selector with `.app-content-inner` and remove `header` from the flex-column selector, leaving only `.page-heading`.

- [ ] **Step 2: Run static and build verification**

Run: `pnpm --filter @data-analyze/web typecheck && pnpm --filter @data-analyze/web build`

Expected: both commands exit with code 0.

- [ ] **Step 3: Manually verify both viewport classes**

Run: `pnpm --filter @data-analyze/web dev`

Expected checks:

1. At desktop width, the header is dark and 64px high; the active menu item is visibly highlighted; the content is centered and capped around 1200px.
2. At a narrow width, the brand and navigation stay on one line and the header can scroll horizontally; page content retains readable side padding.
3. On a short page, the footer is placed at the viewport bottom; opening the prompt dialog keeps its dialog header actions aligned horizontally.

- [ ] **Step 4: Commit the CSS frame**

```bash
git add apps/web/src/styles.css
git commit -m "style(web): polish application shell"
```

### Task 4: Run the Web regression suite

**Files:**
- Verify only: `apps/web/src/App.tsx`, `apps/web/src/App.test.tsx`, `apps/web/src/styles.css`

**Interfaces:**
- Consumes: the implemented application shell and existing feature tests.
- Produces: fresh evidence that the UI-shell refactor does not break the Web project.

- [ ] **Step 1: Run all Web checks**

Run: `pnpm --filter @data-analyze/web typecheck && pnpm --filter @data-analyze/web test && pnpm --filter @data-analyze/web build`

Expected: each command exits with code 0; the test command reports no failed tests.

- [ ] **Step 2: Inspect the final change scope**

Run: `git diff HEAD~2..HEAD -- apps/web/src/App.tsx apps/web/src/App.test.tsx apps/web/src/styles.css && git status --short`

Expected: only the application shell, its test, and its CSS are included in the two implementation commits; pre-existing changes to `apps/web/package.json` and `pnpm-lock.yaml` remain unstaged and untouched.
