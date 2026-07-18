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
  const currentYear = new Date().getFullYear()

  return (
    <Layout className="app-shell">
      <Layout.Header className="app-header">
        <div className="app-header-inner">
          <h1 className="app-brand">NEXUS 数据智能平台</h1>
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
        <div className={`app-content-inner${location.pathname.startsWith('/analyses/') ? ' app-content-inner--wide' : ''}`}>
          <Outlet />
        </div>
      </Layout.Content>
      <Layout.Footer className="app-footer">
        © {currentYear} NEXUS 数据智能平台 · Created by vincent-xw · All Rights Reserved.
      </Layout.Footer>
    </Layout>
  )
}
