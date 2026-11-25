import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { createUser, deleteUser, listRoleOptions, listUsers, updateUser } from '../api.js'
import { useAuth } from '../auth/AuthContext.jsx'
import ConfirmDelete from '../components/ConfirmDelete.jsx'
import ErrorBanner from '../components/ErrorBanner.jsx'
import Field, { fieldAria, mapFieldErrors } from '../components/Field.jsx'
import Modal from '../components/Modal.jsx'
import Skeleton from '../components/Skeleton.jsx'
import { useToast } from '../components/Toast.jsx'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const NEW_USER = { fullName: '', email: '', password: '', roleId: '', isActive: true }

export default function UsersPage() {
  const { can } = useAuth()
  const toast = useToast()
  const [users, setUsers] = useState(null)
  const [roles, setRoles] = useState(null)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState(null) // null = closed
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [toDelete, setToDelete] = useState(null)

  const load = useCallback(async () => {
    try {
      const [u, r] = await Promise.all([listUsers(), listRoleOptions()])
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

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!users || !q) return users
    return users.filter((u) => [u.fullName, u.email, u.roleName].some((s) => s?.toLowerCase().includes(q)))
  }, [users, search])

  const openForm = (user) => {
    setErrors({})
    setFormError(null)
    setForm(
      user
        ? { id: user.id, fullName: user.fullName, email: user.email, password: '', roleId: String(user.roleId), isActive: user.isActive }
        : { ...NEW_USER },
    )
  }
  const closeForm = () => setForm(null)

  const submit = async (e) => {
    e.preventDefault()
    const editing = !!form.id
    const fullName = form.fullName.trim()
    const email = form.email.trim()
    const v = {}
    if (!fullName) v.fullName = 'Full name is required'
    if (!email) v.email = 'Email is required'
    else if (!EMAIL_RE.test(email)) v.email = 'Enter a valid email address'
    if (!form.roleId) v.roleId = 'Role is required'
    if (!editing && !form.password) v.password = 'Password is required'
    else if (form.password && form.password.length < 8) v.password = 'Password must be at least 8 characters'
    setFormError(null)
    setErrors(v)
    if (Object.keys(v).length) return
    const data = { fullName, email, roleId: Number(form.roleId), isActive: form.isActive }
    if (form.password) data.password = form.password
    setSaving(true)
    try {
      if (editing) await updateUser(form.id, data)
      else await createUser(data)
      closeForm()
      setError(null)
      toast(editing ? 'User updated' : 'User created')
      await load()
    } catch (err) {
      const fe = mapFieldErrors(err, /email/i.test(err.message) ? 'email' : undefined)
      if (Object.keys(fe).length) setErrors(fe)
      else setFormError(err)
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
      toast('User deleted')
      await load()
    } catch (err) {
      setError(err)
    }
  }

  const noRoles = roles !== null && roles.length === 0
  const canCreate = can('users.create')
  const canEdit = can('users.edit')
  const canDelete = can('users.delete')
  const showActions = canEdit || canDelete
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  return (
    <section>
      <div className="page-head">
        <h1>Users</h1>
        {canCreate && (
          <button type="button" className="btn btn-primary" onClick={() => openForm(null)}>Add user</button>
        )}
      </div>
      <ErrorBanner error={error} onClose={() => setError(null)} />

      {users !== null && users.length > 0 && (
        <div className="toolbar">
          <label htmlFor="user-search" className="sr-only">Search users</label>
          <input id="user-search" type="search" placeholder="Search by name, email or role" value={search}
            onChange={(e) => setSearch(e.target.value)} />
        </div>
      )}

      {users === null ? (
        <Skeleton />
      ) : users.length === 0 ? (
        !error && <p className="empty">No users yet.</p>
      ) : visible.length === 0 ? (
        <p className="empty">No users match your search.</p>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Full name</th><th>Email</th><th>Role</th><th>Status</th>
                {showActions && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {visible.map((u) => (
                <tr key={u.id}>
                  <td data-label="Full name" className="break">{u.fullName}</td>
                  <td data-label="Email" className="break">{u.email}</td>
                  <td data-label="Role" className="break">{u.roleName}</td>
                  <td data-label="Status">
                    <span className={`badge ${u.isActive ? 'badge-on' : 'badge-off'}`}>{u.isActive ? 'Active' : 'Inactive'}</span>
                  </td>
                  {showActions && (
                    <td data-label="Actions" className="row-actions">
                      {canEdit && (
                        <button type="button" className="btn" onClick={() => openForm(u)} aria-label={`Edit ${u.fullName}`}>Edit</button>
                      )}
                      {canDelete && (
                        <button type="button" className="btn btn-danger-outline" onClick={() => setToDelete(u)} aria-label={`Delete ${u.fullName}`}>Delete</button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!form} title={form?.id ? 'Edit user' : 'Add user'} titleId="user-form-title" onClose={closeForm}>
        {form && (
          <form onSubmit={submit} noValidate aria-labelledby="user-form-title">
            <ErrorBanner error={formError} />
            {noRoles ? (
              <p className="empty">
                Create a role first.{' '}
                {can('roles.view') && <Link to="/roles">Go to Roles</Link>}
              </p>
            ) : (
              <>
                <Field id="u-fullName" label="Full name *" error={errors.fullName}>
                  <input id="u-fullName" value={form.fullName} maxLength={100} autoFocus
                    {...fieldAria('u-fullName', errors.fullName)} onChange={set('fullName')} />
                </Field>
                <Field id="u-email" label="Email *" error={errors.email}>
                  <input id="u-email" type="email" value={form.email} maxLength={255}
                    {...fieldAria('u-email', errors.email)} onChange={set('email')} />
                </Field>
                <Field id="u-password" label={form.id ? 'Password' : 'Password *'} error={errors.password}
                  hint={form.id ? 'Leave blank to keep the current password' : 'At least 8 characters'}>
                  <input id="u-password" type="password" autoComplete="new-password" value={form.password}
                    {...fieldAria('u-password', errors.password, true)} onChange={set('password')} />
                </Field>
                <Field id="u-roleId" label="Role *" error={errors.roleId}>
                  <select id="u-roleId" value={form.roleId} {...fieldAria('u-roleId', errors.roleId)} onChange={set('roleId')}>
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
              <button type="button" className="btn" onClick={closeForm}>Cancel</button>
              {!noRoles && (
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
              )}
            </div>
          </form>
        )}
      </Modal>

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
