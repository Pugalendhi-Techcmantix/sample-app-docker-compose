import { useCallback, useEffect, useState } from 'react'
import { createRole, deleteRole, listPermissions, listRoles, updateRole } from '../api.js'
import { useAuth } from '../auth/AuthContext.jsx'
import Chips from '../components/Chips.jsx'
import ConfirmDelete from '../components/ConfirmDelete.jsx'
import ErrorBanner from '../components/ErrorBanner.jsx'
import Field, { fieldAria, mapFieldErrors } from '../components/Field.jsx'
import Modal from '../components/Modal.jsx'
import Skeleton from '../components/Skeleton.jsx'
import { useToast } from '../components/Toast.jsx'

const groupLabel = (g) => g[0].toUpperCase() + g.slice(1)

export default function RolesPage() {
  const { can } = useAuth()
  const toast = useToast()
  const canManage = can('roles.manage')
  const [roles, setRoles] = useState(null)
  const [permissions, setPermissions] = useState([])
  const [error, setError] = useState(null)
  const [form, setForm] = useState(null) // null = closed; { id?, name, description, permissions }
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [toDelete, setToDelete] = useState(null)

  const load = useCallback(async () => {
    try {
      setRoles(await listRoles())
      setError(null)
    } catch (e) {
      setError(e)
      setRoles((r) => r ?? [])
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // The permission list is only needed for the form.
  useEffect(() => {
    if (!canManage) return
    listPermissions().then(setPermissions, setError)
  }, [canManage])

  const openForm = (role) => {
    setErrors({})
    setFormError(null)
    setForm(
      role
        ? { id: role.id, name: role.name, description: role.description ?? '', permissions: [...(role.permissions ?? [])] }
        : { name: '', description: '', permissions: [] },
    )
  }
  const closeForm = () => setForm(null)

  const togglePermission = (key, on) =>
    setForm((f) => ({ ...f, permissions: on ? [...f.permissions, key] : f.permissions.filter((p) => p !== key) }))

  const submit = async (e) => {
    e.preventDefault()
    const name = form.name.trim()
    setFormError(null)
    if (!name) return setErrors({ name: 'Name is required' })
    setErrors({})
    const data = { name, description: form.description.trim() || null, permissions: form.permissions }
    setSaving(true)
    try {
      if (form.id) await updateRole(form.id, data)
      else await createRole(data)
      closeForm()
      setError(null)
      toast(form.id ? 'Role updated' : 'Role created')
      await load()
    } catch (err) {
      const fe = mapFieldErrors(err, /name/i.test(err.message) ? 'name' : undefined)
      if (Object.keys(fe).length) setErrors(fe)
      else setFormError(err)
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    const role = toDelete
    setToDelete(null)
    try {
      await deleteRole(role.id)
      setError(null)
      toast('Role deleted')
      await load()
    } catch (err) {
      setError(err)
    }
  }

  const groups = [...new Set(permissions.map((p) => p.group))]

  return (
    <section>
      <div className="page-head">
        <h1>Roles</h1>
        {canManage && (
          <button type="button" className="btn btn-primary" onClick={() => openForm(null)}>Add role</button>
        )}
      </div>
      <ErrorBanner error={error} onClose={() => setError(null)} />

      {roles === null ? (
        <Skeleton />
      ) : roles.length === 0 ? (
        !error && <p className="empty">No roles yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Name</th><th>Description</th><th>Permissions</th><th>Users</th>
                {canManage && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r.id}>
                  <td data-label="Name" className="break">{r.name}</td>
                  <td data-label="Description" className="break">{r.description || '—'}</td>
                  <td data-label="Permissions"><Chips items={r.permissions} /></td>
                  <td data-label="Users">{r.userCount ?? 0}</td>
                  {canManage && (
                    <td data-label="Actions" className="row-actions">
                      <button type="button" className="btn" onClick={() => openForm(r)} aria-label={`Edit ${r.name}`}>Edit</button>
                      <button type="button" className="btn btn-danger-outline" onClick={() => setToDelete(r)} aria-label={`Delete ${r.name}`}>Delete</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!form} title={form?.id ? 'Edit role' : 'Add role'} titleId="role-form-title" onClose={closeForm}>
        {form && (
          <form onSubmit={submit} noValidate aria-labelledby="role-form-title">
            <ErrorBanner error={formError} />
            <Field id="role-name" label="Name *" error={errors.name}>
              <input id="role-name" value={form.name} maxLength={50} autoFocus
                {...fieldAria('role-name', errors.name)} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field id="role-desc" label="Description" error={errors.description}>
              <textarea id="role-desc" rows={2} maxLength={255} value={form.description}
                {...fieldAria('role-desc', errors.description)} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            {groups.map((g) => (
              <fieldset key={g} className="perm-group">
                <legend>{groupLabel(g)} permissions</legend>
                {permissions.filter((p) => p.group === g).map((p) => (
                  <div key={p.key} className="field check">
                    <input id={`perm-${p.key}`} type="checkbox" checked={form.permissions.includes(p.key)}
                      onChange={(e) => togglePermission(p.key, e.target.checked)} />
                    <label htmlFor={`perm-${p.key}`}>{p.label}</label>
                  </div>
                ))}
              </fieldset>
            ))}
            {errors.permissions && <p className="field-error">{errors.permissions}</p>}
            <div className="actions">
              <button type="button" className="btn" onClick={closeForm}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDelete
        open={!!toDelete}
        title="Delete role?"
        message={toDelete ? `Delete role "${toDelete.name}"? This cannot be undone.` : ''}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </section>
  )
}
