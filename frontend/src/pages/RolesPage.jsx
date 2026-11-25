import { useCallback, useEffect, useState } from 'react'
import { createRole, deleteRole, listRoles, updateRole } from '../api.js'
import ConfirmDelete from '../components/ConfirmDelete.jsx'
import ErrorBanner from '../components/ErrorBanner.jsx'

const EMPTY = { name: '', description: '' }

function fieldErrors(err, conflictField) {
  const out = {}
  if (err.details?.length) for (const d of err.details) out[d.field] = d.message
  else if (err.status === 409) out[conflictField] = err.message
  return out
}

export default function RolesPage() {
  const [roles, setRoles] = useState(null)
  const [error, setError] = useState(null)
  const [form, setForm] = useState(null) // null = closed; { id?, name, description }
  const [errors, setErrors] = useState({})
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

  const openForm = (role) => {
    setErrors({})
    setForm(role ? { id: role.id, name: role.name, description: role.description ?? '' } : { ...EMPTY })
  }

  const submit = async (e) => {
    e.preventDefault()
    const name = form.name.trim()
    if (!name) return setErrors({ name: 'Name is required' })
    const data = { name, description: form.description.trim() || null }
    setSaving(true)
    try {
      if (form.id) await updateRole(form.id, data)
      else await createRole(data)
      setForm(null)
      setError(null)
      await load()
    } catch (err) {
      const fe = fieldErrors(err, 'name')
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
    const role = toDelete
    setToDelete(null)
    try {
      await deleteRole(role.id)
      setError(null)
      await load()
    } catch (err) {
      setError(err)
    }
  }

  return (
    <section>
      <div className="page-head">
        <h1>Roles</h1>
        <button type="button" className="btn btn-primary" onClick={() => openForm(null)}>Add role</button>
      </div>
      <ErrorBanner error={error} onClose={() => setError(null)} />

      {form && (
        <form className="card form" onSubmit={submit} noValidate aria-label={form.id ? 'Edit role' : 'Add role'}>
          <h2>{form.id ? 'Edit role' : 'Add role'}</h2>
          <div className="field">
            <label htmlFor="role-name">Name *</label>
            <input
              id="role-name"
              value={form.name}
              maxLength={50}
              autoFocus
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'role-name-err' : undefined}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            {errors.name && <p id="role-name-err" className="field-error">{errors.name}</p>}
          </div>
          <div className="field">
            <label htmlFor="role-desc">Description</label>
            <textarea
              id="role-desc"
              rows={2}
              maxLength={255}
              value={form.description}
              aria-invalid={!!errors.description}
              aria-describedby={errors.description ? 'role-desc-err' : undefined}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            {errors.description && <p id="role-desc-err" className="field-error">{errors.description}</p>}
          </div>
          <div className="actions">
            <button type="button" className="btn" onClick={() => setForm(null)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      )}

      {roles === null ? (
        <p role="status">Loading…</p>
      ) : roles.length === 0 ? (
        !error && <p className="empty">No roles yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th>Name</th><th>Description</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r.id}>
                  <td data-label="Name" className="break">{r.name}</td>
                  <td data-label="Description" className="break">{r.description || '—'}</td>
                  <td data-label="Actions" className="row-actions">
                    <button type="button" className="btn" onClick={() => openForm(r)} aria-label={`Edit ${r.name}`}>Edit</button>
                    <button type="button" className="btn btn-danger-outline" onClick={() => setToDelete(r)} aria-label={`Delete ${r.name}`}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
