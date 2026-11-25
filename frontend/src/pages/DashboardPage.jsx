import { useEffect, useState } from 'react'
import { ArrowRight, KeyRound, Shield, Users as UsersIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { listRoles, listUsers } from '../api.js'
import { useAuth } from '../auth/AuthContext.jsx'
import Chips, { ChipsLegend } from '../components/Chips.jsx'
import ErrorBanner from '../components/ErrorBanner.jsx'
import Skeleton from '../components/Skeleton.jsx'
import { Avatar, PageHead } from '../components/ui.jsx'

const joined = (iso) => {
  const d = iso ? new Date(iso) : null
  return d && !Number.isNaN(d.getTime()) ? new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(d) : null
}

function Stat({ label, value, meta, icon: Icon }) {
  return (
    <div className="card stat" role="group" aria-label={`${label} count`}>
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        <span className="stat-icon" aria-hidden="true"><Icon size={16} /></span>
      </div>
      <span className="stat-value">{value}</span>
      {meta && <span className="stat-meta">{meta}</span>}
    </div>
  )
}

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
  const active = users?.filter((u) => u.isActive).length ?? 0
  const inactive = (users?.length ?? 0) - active
  const unusedRoles = roles?.filter((r) => !r.userCount).length ?? 0
  const statCount = (canUsers ? 1 : 0) + (canRoles ? 1 : 0)

  return (
    <section>
      <PageHead title="Dashboard" description={`Welcome back, ${user.fullName}.`} />
      <ErrorBanner error={error} onClose={() => setError(null)} />

      {statCount > 0 && (waiting ? (
        <Skeleton rows={statCount} variant="stats" />
      ) : (
        <div className="stats">
          {canUsers && users && (
            <Stat label="Users" value={users.length} icon={UsersIcon}
              meta={inactive ? `${active} active, ${inactive} inactive` : `All ${active} active`} />
          )}
          {canRoles && roles && (
            <Stat label="Roles" value={roles.length} icon={Shield}
              meta={unusedRoles ? `${roles.length - unusedRoles} in use, ${unusedRoles} unused` : 'All in use'} />
          )}
        </div>
      ))}

      <div className="dash-grid">
        {canUsers && recent.length > 0 && (
          <section className="card" aria-labelledby="recent-title">
            <div className="card-head">
              <h2 id="recent-title">Recent users</h2>
              <Link to="/users" className="link-btn">View all <ArrowRight size={14} aria-hidden="true" /></Link>
            </div>
            <ul className="plain-list person-list">
              {recent.map((u) => (
                <li key={u.id}>
                  <Avatar name={u.fullName} />
                  <span className="person-text">
                    <strong>{u.fullName}</strong>
                    <span>{u.email}</span>
                  </span>
                  <span className="person-meta">
                    <span className="tag">{u.roleName}</span>
                    {joined(u.createdAt) && <span>Joined {joined(u.createdAt)}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="card" aria-labelledby="access-title">
          <div className="card-head">
            <h2 id="access-title">Your access</h2>
            <Link to="/profile" className="link-btn">Profile <ArrowRight size={14} aria-hidden="true" /></Link>
          </div>
          <div className="access-role">
            <span className="stat-icon" aria-hidden="true"><KeyRound size={18} /></span>
            <p>Your role <strong>{user.roleName}</strong></p>
          </div>
          <Chips items={user.permissions} empty="No permissions assigned" />
          {user.permissions?.length > 0 && <ChipsLegend />}
        </section>
      </div>
    </section>
  )
}
