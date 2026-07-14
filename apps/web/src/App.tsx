import { NavLink, Outlet } from 'react-router-dom'

export function App() {
  return (
    <main>
      <header>
        <h1>数据分析 Agent</h1>
        <nav aria-label="主导航">
          <NavLink to="/templates">分析模板</NavLink>
          <NavLink to="/datasets/new">上传数据</NavLink>
        </nav>
      </header>
      <Outlet />
    </main>
  )
}
