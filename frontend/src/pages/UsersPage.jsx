import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { createUser, deleteUser, listRoles, listUsers, updateUser } from '../api.js'
import ConfirmDelete from '../components/ConfirmDelete.jsx'
import ErrorBanner from '../components/ErrorBanner.jsx'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function fieldErrors(err) {
  const out = {}
  if (err.details?.length) for (const d of err.details) out[d.field] = d.message
  else if (err.status === 409) out.email = err.message
  return out
}

function Field({ id, label, error, children }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {error && <p id={`${id}-err`} className="field-error">{error}</p>}
    </div>
  )
}

export default function UsersPage() {
  const [users, setUsers] = useState(null)
  const [roles, setRoles] = useState(null)
  const [error, setError] = useState(null)
  const [form, setForm] = useState(null)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [toDelete, setToDelete] = useState(null)

  const load = useCallback(async () => {
    try {
      const [u, r] = await Promise.all([listUsers(), listRoles()])
      setUsers(u)
      setRoles(r)
      setError(null)
    } catch (e) {
      setError(e)
      setUsers((u) => u ?? [])
      setRoles((r) => r ?? [])
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const openForm = (user) => {
    setErrors({})
    setForm(
      user
        ? { id: user.id, fullName: user.fullName, email: user.email, roleId: String(user.roleId), isActive: user.isActive }
        : { fullName: '', email: '', roleId: '', isActive: true },
    )
  }

  const submit = async (e) => {
    e.preventDefault()
    const fullName = form.fullName.trim()
    const email = form.email.trim()
    const v = {}
    if (!fullName) v.fullName = 'Full name is required'
    if (!email) v.email = 'Email is required'
    else if (!EMAIL_RE.test(email)) v.email = 'Enter a valid email address'
    if (!form.roleId) v.roleId = 'Role is required'
    if (Object.keys(v).length) return setErrors(v)
    const data = { fullName, email, roleId: Number(form.roleId), isActive: form.isActive }
    setSaving(true)
    try {
      if (form.id) await updateUser(form.id, data)
      else await createUser(data)
      setForm(null)
      setError(null)
      await load()
    } catch (err) {
      const fe = fieldErrors(err)
      if (Object.keys(fe).length) setErrors(fe)
      else {
        setErrors({})
        setError(err)
      }
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    const user = toDelete
    setToDelete(null)
    try {
      await deleteUser(user.id)
      setError(null)
      await load()
    } catch (err) {
      setError(err)
    }
  }

  const noRoles = roles !== null && roles.length === 0
  const aria = (k) => (errors[k] ? { 'aria-invalid': true, 'aria-describedby': `u-${k}-err` } : {})

  return (
    <section>
      <div className="page-head">
        <h1>Users</h1>
        <button type="button" className="btn btn-primary" onClick={() => openForm(null)}>Add user</button>
      </div>
      <ErrorBanner error={error} onClose={() => setError(null)} />

      {form && (
        <form className="card form" onSubmit={submit} noValidate aria-label={form.id ? 'Edit user' : 'Add user'}>
          <h2>{form.id ? 'Edit user' : 'Add user'}</h2>
          {noRoles ? (
            <p className="empty">
              Create a role first. <Link to="/roles">Go to Roles</Link>
            </p>
          ) : (
            <>
              <Field id="u-fullName" label="Full name *" error={errors.fullName}>
                <input id="u-fullName" value={form.fullName} maxLength={100} autoFocus {...aria('fullName')}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
              </Field>
              <Field id="u-email" label="Email *" error={errors.email}>
                <input id="u-email" type="email" value={form.email} maxLength={255} {...aria('email')}
                  onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </Field>
              <Field id="u-roleId" label="Role *" error={errors.roleId}>
                <select id="u-roleId" value={form.roleId} {...aria('roleId')}
                  onChange={(e) => setForm({ ...form, roleId: e.target.value })}>
                  <option value="">Select a role…</option>
                  {(roles ?? []).map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </Field>
              <div className="field check">
                <input id="u-active" type="checkbox" checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                <label htmlFor="u-active">Active</label>
              </div>
            </>
          )}
          <div className="actions">
            <button type="button" className="btn" onClick={() => setForm(null)}>Cancel</button>
            {!noRoles && (
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            )}
          </div>
        </form>
      )}

      {users === null ? (
        <p role="status">Loading…</p>
      ) : users.length === 0 ? (
        !error && <p className="empty">No users yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th>Full name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td data-label="Full name" className="break">{u.fullName}</td>
                  <td data-label="Email" className="break">{u.email}</td>
                  <td data-label="Role" className="break">{u.roleName}</td>
                  <td data-label="Status">
                    <span className={`badge ${u.isActive ? 'badge-on' : 'badge-off'}`}>{u.isActive ? 'Active' : 'Inactive'}</span>
                  </td>
                  <td data-label="Actions" className="row-actions">
                    <button type="button" className="btn" onClick={() => openForm(u)} aria-label={`Edit ${u.fullName}`}>Edit</button>
                    <button type="button" className="btn btn-danger-outline" onClick={() => setToDelete(u)} aria-label={`Delete ${u.fullName}`}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDelete
        open={!!toDelete}
        title="Delete user?"
        message={toDelete ? `Delete user "${toDelete.fullName}"? This cannot be undone.` : ''}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </section>
  )
}
