import { useState } from 'react'
import { changePassword } from '../api.js'
import { useAuth } from '../auth/AuthContext.jsx'
import Chips from '../components/Chips.jsx'
import ErrorBanner from '../components/ErrorBanner.jsx'
import Field, { fieldAria, mapFieldErrors } from '../components/Field.jsx'
import { useToast } from '../components/Toast.jsx'

const EMPTY = { currentPassword: '', newPassword: '', confirm: '' }

export default function ProfilePage() {
  const { user } = useAuth()
  const toast = useToast()
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    const v = {}
    if (!form.currentPassword) v.currentPassword = 'Current password is required'
    if (form.newPassword.length < 8) v.newPassword = 'New password must be at least 8 characters'
    else if (form.newPassword !== form.confirm) v.confirm = 'Passwords do not match'
    setErrors(v)
    if (Object.keys(v).length) return
    setBusy(true)
    try {
      await changePassword({ currentPassword: form.currentPassword, newPassword: form.newPassword })
      setForm(EMPTY)
      toast('Password changed')
    } catch (err) {
      const fe = mapFieldErrors(err)
      if (Object.keys(fe).length) setErrors(fe)
      else setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <div className="page-head">
        <h1>Profile</h1>
      </div>
      <div className="card">
        <h2>Your details</h2>
        <dl className="details">
          <dt>Name</dt><dd>{user.fullName}</dd>
          <dt>Email</dt><dd>{user.email}</dd>
          <dt>Role</dt><dd>{user.roleName}</dd>
          <dt>Permissions</dt><dd><Chips items={user.permissions} /></dd>
        </dl>
      </div>
      <form className="card form" onSubmit={submit} noValidate aria-label="Change password">
        <h2>Change password</h2>
        <ErrorBanner error={error} onClose={() => setError(null)} />
        <Field id="pw-current" label="Current password" error={errors.currentPassword}>
          <input id="pw-current" type="password" autoComplete="current-password" value={form.currentPassword}
            {...fieldAria('pw-current', errors.currentPassword)} onChange={set('currentPassword')} />
        </Field>
        <Field id="pw-new" label="New password" error={errors.newPassword} hint="At least 8 characters">
          <input id="pw-new" type="password" autoComplete="new-password" value={form.newPassword}
            {...fieldAria('pw-new', errors.newPassword, true)} onChange={set('newPassword')} />
        </Field>
        <Field id="pw-confirm" label="Confirm new password" error={errors.confirm}>
          <input id="pw-confirm" type="password" autoComplete="new-password" value={form.confirm}
            {...fieldAria('pw-confirm', errors.confirm)} onChange={set('confirm')} />
        </Field>
        <div className="actions">
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button>
        </div>
      </form>
    </section>
  )
}
