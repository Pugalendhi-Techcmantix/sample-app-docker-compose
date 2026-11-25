import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import ErrorBanner from '../components/ErrorBanner.jsx'
import Field, { fieldAria, mapFieldErrors } from '../components/Field.jsx'

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

  if (!loading && user) return <Navigate to={target} replace />

  const submit = async (e) => {
    e.preventDefault()
    const v = {}
    if (!email.trim()) v.email = 'Email is required'
    if (!password) v.password = 'Password is required'
    setErrors(v)
    setError(null)
    if (Object.keys(v).length) return
    setBusy(true)
    try {
      await login(email.trim(), password)
      navigate(target, { replace: true })
    } catch (err) {
      const fe = mapFieldErrors(err)
      if (Object.keys(fe).length) setErrors(fe)
      else setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login">
      <form className="card login-card" onSubmit={submit} noValidate aria-label="Sign in">
        <h1>Sign in</h1>
        <ErrorBanner error={error || authError} />
        <Field id="login-email" label="Email" error={errors.email}>
          <input id="login-email" type="email" autoComplete="username" autoFocus value={email}
            {...fieldAria('login-email', errors.email)} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field id="login-password" label="Password" error={errors.password}>
          <input id="login-password" type="password" autoComplete="current-password" value={password}
            {...fieldAria('login-password', errors.password)} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  )
}
