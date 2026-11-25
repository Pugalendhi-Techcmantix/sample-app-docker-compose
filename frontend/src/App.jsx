import { Route, Routes } from 'react-router-dom'
import { PermissionRoute, ProtectedRoute } from './auth/guards.jsx'
import AppShell from './components/AppShell.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import NotFound from './pages/NotFound.jsx'
import ProfilePage from './pages/ProfilePage.jsx'
import RolesPage from './pages/RolesPage.jsx'
import UsersPage from './pages/UsersPage.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route element={<PermissionRoute permission="users.view" />}>
            <Route path="users" element={<UsersPage />} />
          </Route>
          <Route element={<PermissionRoute permission="roles.view" />}>
            <Route path="roles" element={<RolesPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  )
}
