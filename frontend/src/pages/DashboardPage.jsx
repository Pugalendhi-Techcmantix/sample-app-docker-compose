import { useEffect, useState } from 'react'
import { listRoles, listUsers } from '../api.js'
import { useAuth } from '../auth/AuthContext.jsx'
import Chips from '../components/Chips.jsx'
import ErrorBanner from '../components/ErrorBanner.jsx'
import Skeleton from '../components/Skeleton.jsx'

export default function DashboardPage() {
  const { user, can } = useAuth()
  const canUsers = can('users.view')
  const canRoles = can('roles.view')
  const [users, setUsers] = useState(null)
  const [roles, setRoles] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [u, r] = await Promise.all([canUsers ? listUsers() : null, canRoles ? listRoles() : null])
        if (cancelled) return
        setUsers(u)
        setRoles(r)
      } catch (e) {
        if (!cancelled) setError(e)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [canUsers, canRoles])

  const waiting = !error && ((canUsers && users === null) || (canRoles && roles === null))
  const recent = users ? [...users].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')).slice(0, 5) : []

  return (
    <section>
      <div className="page-head">
        <h1>Dashboard</h1>
      </div>
      <p>Welcome back, {user.fullName}.</p>
      <ErrorBanner error={error} onClose={() => setError(null)} />

      {waiting ? (
        <Skeleton rows={2} />
      ) : (
        <div className="stats">
          {canUsers && users && (
            <div className="card stat" aria-label="Users count">
              <span className="stat-label">Users</span>
              <span className="stat-value">{users.length}</span>
            </div>
          )}
          {canRoles && roles && (
            <div className="card stat" aria-label="Roles count">
              <span className="stat-label">Roles</span>
              <span className="stat-value">{roles.length}</span>
            </div>
          )}
        </div>
      )}

      <div className="card">
        <h2>Your access</h2>
        <p>Role: <strong>{user.roleName}</strong></p>
        <Chips items={user.permissions} empty="No permissions assigned" />
      </div>

      {canUsers && recent.length > 0 && (
        <div className="card">
          <h2>Recent users</h2>
          <ul className="plain-list">
            {recent.map((u) => (
              <li key={u.id}>{u.fullName} <span className="muted">· {u.roleName}</span></li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
