import { NavLink, Outlet } from 'react-router-dom'

export function App() {
  return (
    <main>
      <header>
        <h1>数据分析 Agent</h1>
        <nav aria-label="主导航">
          <NavLink to="/assets">我的数据</NavLink>
          <NavLink to="/analyses">数据分析</NavLink>
          <NavLink to="/settings">系统设置</NavLink>
          <NavLink to="/assets/upload">上传数据</NavLink>
        </nav>
      </header>
      <Outlet />
    </main>
  )
}
