import { useState } from 'react'
import { changePassword } from '../api.js'
import { useAuth } from '../auth/AuthContext.jsx'
import Chips, { ChipsLegend } from '../components/Chips.jsx'
import ErrorBanner from '../components/ErrorBanner.jsx'
import Field, { fieldAria, focusFirstError, mapFieldErrors } from '../components/Field.jsx'
import { useToast } from '../components/Toast.jsx'
import { Avatar, PageHead } from '../components/ui.jsx'

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
    const formEl = e.currentTarget
    setError(null)
    const v = {}
    if (!form.currentPassword) v.currentPassword = 'Current password is required'
    if (form.newPassword.length < 8) v.newPassword = 'New password must be at least 8 characters'
    else if (form.newPassword !== form.confirm) v.confirm = 'Passwords do not match'
    setErrors(v)
    if (Object.keys(v).length) return focusFirstError(formEl)
    setBusy(true)
    try {
      await changePassword({ currentPassword: form.currentPassword, newPassword: form.newPassword })
      setForm(EMPTY)
      toast('Password changed')
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
    <section>
      <PageHead title="Profile" description="Your account details and password." />
      <div className="profile-grid">
        <section className="card" aria-labelledby="details-title">
          <h2 id="details-title">Your details</h2>
          <div className="profile-id">
            <Avatar name={user.fullName} size="lg" self />
            <span className="break">
              <strong>{user.fullName}</strong>
              <span className="muted">{user.email}</span>
            </span>
          </div>
          <dl className="details">
            <dt>Role</dt><dd>{user.roleName}</dd>
            <dt>Permissions</dt><dd><Chips items={user.permissions} /></dd>
          </dl>
          {user.permissions?.length > 0 && <ChipsLegend />}
        </section>
        <form className="card form" onSubmit={submit} noValidate aria-label="Change password">
          <h2>Change password</h2>
          <ErrorBanner error={error} onClose={() => setError(null)} />
          <Field id="pw-current" label="Current password" error={errors.currentPassword}>
            <input id="pw-current" name="current-password" type="password" autoComplete="current-password" value={form.currentPassword}
              {...fieldAria('pw-current', errors.currentPassword)} onChange={set('currentPassword')} />
          </Field>
          <Field id="pw-new" label="New password" error={errors.newPassword} hint="At least 8 characters">
            <input id="pw-new" name="new-password" type="password" autoComplete="new-password" value={form.newPassword}
              {...fieldAria('pw-new', errors.newPassword, true)} onChange={set('newPassword')} />
          </Field>
          <Field id="pw-confirm" label="Confirm new password" error={errors.confirm}>
            <input id="pw-confirm" name="confirm-password" type="password" autoComplete="new-password" value={form.confirm}
              {...fieldAria('pw-confirm', errors.confirm)} onChange={set('confirm')} />
          </Field>
          <div className="actions">
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button>
          </div>
        </form>
      </div>
    </section>
  )
}
