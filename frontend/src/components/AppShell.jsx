import { useEffect, useRef, useState } from 'react'
import { LayoutDashboard, LogOut, Menu, Shield, Users as UsersIcon, UserCircle } from 'lucide-react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import { THEMES, useTheme } from '../theme.js'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/users', label: 'Users', icon: UsersIcon, permission: 'users.view' },
  { to: '/roles', label: 'Roles', icon: Shield, permission: 'roles.view' },
]

function UserMenu() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [theme, setTheme] = useTheme()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const location = useLocation()

  useEffect(() => setOpen(false), [location.pathname])
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    const onClick = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false)
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open])

  const signOut = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="user-menu" ref={ref}>
      <button type="button" className="btn user-menu-trigger" aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen((o) => !o)}>
        <UserCircle size={18} aria-hidden="true" />
        <span className="user-menu-name">{user.fullName}</span>
      </button>
      {open && (
        <div className="menu" role="menu" aria-label="User menu">
          <div className="menu-head">
            <strong>{user.fullName}</strong>
            <span className="muted">{user.roleName}</span>
          </div>
          <Link role="menuitem" to="/profile" className="menu-item">Profile</Link>
          <div className="menu-group" role="group" aria-label="Theme">
            {THEMES.map((t) => (
              <button key={t} type="button" role="menuitemradio" aria-checked={theme === t}
                className="menu-item theme-option" onClick={() => setTheme(t)}>
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          <button type="button" role="menuitem" className="menu-item" onClick={signOut}>
            <LogOut size={16} aria-hidden="true" /> Log out
          </button>
        </div>
      )}
    </div>
  )
}

export default function AppShell() {
  const { can } = useAuth()
  const [navOpen, setNavOpen] = useState(false)
  const location = useLocation()
  useEffect(() => setNavOpen(false), [location.pathname])

  return (
    <div className="shell" data-nav-open={navOpen}>
      <aside className="sidebar" id="sidebar">
        <div className="brand">Master Data</div>
        <nav aria-label="Main">
          {NAV.filter((n) => !n.permission || can(n.permission)).map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className="nav-link">
              <Icon size={18} aria-hidden="true" /> {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="shell-main">
        <header className="topbar">
          <button type="button" className="btn btn-ghost nav-toggle" aria-label="Toggle navigation"
            aria-controls="sidebar" aria-expanded={navOpen} onClick={() => setNavOpen((o) => !o)}>
            <Menu size={20} aria-hidden="true" />
          </button>
          <div className="topbar-spacer" />
          <UserMenu />
        </header>
        <main>
          <Outlet />
        </main>
      </div>
      {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} aria-hidden="true" />}
    </div>
  )
}
