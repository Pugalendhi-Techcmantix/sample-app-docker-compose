import { useEffect, useRef, useState } from 'react'
import { ChevronDown, LayoutDashboard, LogOut, Menu, Monitor, Moon, Shield, Sun, UserRound, Users as UsersIcon, X } from 'lucide-react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import { THEMES, useTheme } from '../theme.js'
import { Avatar, BrandMark } from './ui.jsx'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/users', label: 'Users', icon: UsersIcon, permission: 'users.view' },
  { to: '/roles', label: 'Roles', icon: Shield, permission: 'roles.view' },
]
const THEME_ICONS = { light: Sun, dark: Moon, system: Monitor }

function UserMenu() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [theme, setTheme] = useTheme()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const triggerRef = useRef(null)
  const location = useLocation()

  useEffect(() => setOpen(false), [location.pathname])
  useEffect(() => {
    if (!open) return
    const items = () => [...ref.current.querySelectorAll('[role^="menuitem"]')]
    items()[0]?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
        return
      }
      const list = items()
      const i = list.indexOf(document.activeElement)
      const move = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: list.length - 1 }[e.key]
      if (move === undefined || !list.length) return
      e.preventDefault()
      list[(move + list.length) % list.length].focus()
    }
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
  // Tabbing out of the menu closes it.
  const onBlur = (e) => {
    if (open && e.relatedTarget && !ref.current.contains(e.relatedTarget)) setOpen(false)
  }

  return (
    <div className="user-menu" ref={ref} onBlur={onBlur}>
      <button type="button" ref={triggerRef} className="btn user-menu-trigger" aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen((o) => !o)}>
        <Avatar name={user.fullName} self />
        <span className="user-menu-name">{user.fullName}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && (
        <div className="menu" role="menu" aria-label="User menu">
          <div className="menu-head">
            <Avatar name={user.fullName} self />
            <span>
              <strong>{user.fullName}</strong>
              <span className="muted">{user.roleName}</span>
            </span>
          </div>
          <Link role="menuitem" to="/profile" className="menu-item">
            <UserRound size={16} aria-hidden="true" /> Profile
          </Link>
          <p className="menu-label" id="theme-label">Theme</p>
          <div className="menu-group" role="group" aria-labelledby="theme-label">
            {THEMES.map((t) => {
              const Icon = THEME_ICONS[t]
              return (
                <button key={t} type="button" role="menuitemradio" aria-checked={theme === t}
                  className="menu-item theme-option" onClick={() => setTheme(t)}>
                  <Icon size={14} aria-hidden="true" />
                  {t[0].toUpperCase() + t.slice(1)}
                </button>
              )
            })}
          </div>
          <hr className="menu-sep" />
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
  const toggleRef = useRef(null)
  const sidebarRef = useRef(null)
  useEffect(() => setNavOpen(false), [location.pathname])

  // Mobile drawer: move focus in on open, Escape closes and returns focus to the toggle.
  useEffect(() => {
    if (!navOpen) return
    sidebarRef.current?.querySelector('a')?.focus()
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      setNavOpen(false)
      toggleRef.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [navOpen])

  return (
    <div className="shell" data-nav-open={navOpen}>
      <a href="#main" className="skip-link">Skip to content</a>
      <aside className="sidebar" id="sidebar" ref={sidebarRef}>
        <div className="sidebar-head">
          <Link to="/" className="brand">
            <BrandMark />
            <span className="brand-name" translate="no">Master Data</span>
          </Link>
          <button type="button" className="btn btn-ghost btn-icon nav-close" aria-label="Close navigation"
            onClick={() => { setNavOpen(false); toggleRef.current?.focus() }}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
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
          <button type="button" ref={toggleRef} className="btn btn-ghost btn-icon nav-toggle" aria-label="Toggle navigation"
            aria-controls="sidebar" aria-expanded={navOpen} onClick={() => setNavOpen((o) => !o)}>
            <Menu size={20} aria-hidden="true" />
          </button>
          <Link to="/" className="brand topbar-brand" aria-label="Master Data, go to dashboard">
            <BrandMark />
            <span className="brand-name" translate="no">Master Data</span>
          </Link>
          <div className="topbar-spacer" />
          <UserMenu />
        </header>
        <main id="main" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
      {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} aria-hidden="true" />}
    </div>
  )
}
