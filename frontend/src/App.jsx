import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import RolesPage from './pages/RolesPage.jsx'
import UsersPage from './pages/UsersPage.jsx'

export default function App() {
  return (
    <>
      <header className="topbar">
        <span className="brand">Master Data</span>
        <nav aria-label="Main">
          <NavLink to="/users">Users</NavLink>
          <NavLink to="/roles">Roles</NavLink>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/users" replace />} />
          <Route path="/roles" element={<RolesPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="*" element={<p>Page not found.</p>} />
        </Routes>
      </main>
    </>
  )
}
