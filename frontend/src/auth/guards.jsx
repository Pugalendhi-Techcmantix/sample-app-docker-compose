import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'
import Forbidden from '../pages/Forbidden.jsx'

export function ProtectedRoute() {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div className="page-loading" role="status">Loading…</div>
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />
  return <Outlet />
}

export function PermissionRoute({ permission }) {
  const { can } = useAuth()
  return can(permission) ? <Outlet /> : <Forbidden />
}
