import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import ErrorBanner from '../components/ErrorBanner.jsx'
import Field, { fieldAria, focusFirstError, mapFieldErrors } from '../components/Field.jsx'
import { BrandMark } from '../components/ui.jsx'

// The seeded roles from the product spec, drawn as the role x permission grid this app manages.
const MATRIX = [
  ['Admin', [1, 1, 1, 1, 1, 1]],
  ['Manager', [1, 1, 1, 0, 1, 0]],
  ['Staff', [1, 0, 0, 0, 0, 0]],
]
const COLS = ['view', 'create', 'edit', 'delete', 'view', 'manage']

function AccessMatrix() {
  return (
    <div className="matrix" aria-hidden="true">
      <span />
      <span className="group">Users</span>
      <span className="group">Roles</span>
      <span />
      {COLS.map((c, i) => <span key={i} className="mh">{c}</span>)}
      {MATRIX.map(([role, cells]) => [
        <span key={role}>{role}</span>,
        ...cells.map((on, i) => <i key={`${role}${i}`} className={on ? (COLS[i] === 'view' ? 'on read' : 'on') : undefined} />),
      ])}
    </div>
  )
}

export default function LoginPage() {
  const { user, loading, error: authError, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from
  const target = from ? `${from.pathname}${from.search ?? ''}` : '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState({})
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  if (!loading && user) return <Navigate to={target} replace />

  const submit = async (e) => {
    e.preventDefault()
    const formEl = e.currentTarget
    const v = {}
    if (!email.trim()) v.email = 'Email is required'
    if (!password) v.password = 'Password is required'
    setErrors(v)
    setError(null)
    if (Object.keys(v).length) return focusFirstError(formEl)
    setBusy(true)
    try {
      await login(email.trim(), password)
      navigate(target, { replace: true })
    } catch (err) {
      const fe = mapFieldErrors(err)
      if (Object.keys(fe).length) {
        setErrors(fe)
        focusFirstError(formEl)
      }
      else setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login">
      <div className="login-aside">
        <span className="brand">
          <BrandMark />
          <span className="brand-name" translate="no">Master Data</span>
        </span>
        <div className="login-story">
          <div className="login-pitch">
            <p className="pitch-title">Decide who can do what.</p>
            <p>Give every person a role, and every role exactly the permissions it needs.</p>
          </div>
          <AccessMatrix />
        </div>
      </div>
      <div className="login-main">
        <form className="login-card" onSubmit={submit} noValidate aria-label="Sign in">
          <span className="brand login-brand">
            <BrandMark />
            <span className="brand-name" translate="no">Master Data</span>
          </span>
          <h1>Sign in</h1>
          <p className="lede">Use your work email and password.</p>
          <ErrorBanner error={error || authError} />
          <Field id="login-email" label="Email" error={errors.email}>
            <input id="login-email" name="email" type="email" autoComplete="username" autoFocus value={email}
              spellCheck={false} placeholder="name@company.com"
              {...fieldAria('login-email', errors.email)} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field id="login-password" label="Password" error={errors.password}>
            <div className="input-affix">
              <input id="login-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password}
                {...fieldAria('login-password', errors.password)} onChange={(e) => setPassword(e.target.value)} />
              <button type="button" className="btn btn-ghost btn-icon" onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'} aria-controls="login-password">
                {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
              </button>
            </div>
          </Field>
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="login-help">No account yet? Ask an administrator to create one for you.</p>
      </div>
    </main>
  )
}
