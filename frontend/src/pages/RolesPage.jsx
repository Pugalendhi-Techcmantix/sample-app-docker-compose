import { useCallback, useEffect, useState } from 'react'
import { Pencil, Plus, Shield, Trash2 } from 'lucide-react'
import { createRole, deleteRole, listPermissions, listRoles, updateRole } from '../api.js'
import { useAuth } from '../auth/AuthContext.jsx'
import Chips, { ChipsLegend } from '../components/Chips.jsx'
import ConfirmDelete from '../components/ConfirmDelete.jsx'
import ErrorBanner from '../components/ErrorBanner.jsx'
import Field, { fieldAria, focusFirstError, mapFieldErrors } from '../components/Field.jsx'
import Modal from '../components/Modal.jsx'
import Skeleton from '../components/Skeleton.jsx'
import { useToast } from '../components/Toast.jsx'
import { EmptyState, PageHead } from '../components/ui.jsx'

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
    const formEl = e.currentTarget
    const name = form.name.trim()
    setFormError(null)
    if (!name) {
      setErrors({ name: 'Name is required' })
      return focusFirstError(formEl)
    }
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
      if (Object.keys(fe).length) {
        setErrors(fe)
        focusFirstError(formEl)
      }
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
      <PageHead title="Roles" description="A role is a set of permissions. Everyone who has the role gets them.">
        {canManage && (
          <button type="button" className="btn btn-primary" onClick={() => openForm(null)}>
            <Plus size={16} aria-hidden="true" /> Add role
          </button>
        )}
      </PageHead>
      <ErrorBanner error={error} onClose={() => setError(null)} />

      {roles === null ? (
        <Skeleton />
      ) : roles.length === 0 ? (
        !error && (
          <EmptyState icon={Shield} title="No roles yet."
            action={canManage && (
              <button type="button" className="btn btn-primary" onClick={() => openForm(null)}>Create the first role</button>
            )}>
            Create a role, choose what it may do, then give it to people on the Users page.
          </EmptyState>
        )
      ) : (
        <>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Role</th><th scope="col">Permissions</th><th scope="col" className="cell-num">Users</th>
                  {canManage && <th scope="col" className="th-actions"><span className="sr-only">Actions</span></th>}
                </tr>
              </thead>
              <tbody>
                {roles.map((r) => (
                  <tr key={r.id}>
                    <td data-label="Role" className="cell-lead role-cell">
                      <span className="cell-primary break">{r.name}</span>
                      {r.description && <span className="cell-sub break">{r.description}</span>}
                    </td>
                    <td data-label="Permissions" className="chips-cell"><Chips items={r.permissions} empty="No permissions" /></td>
                    <td data-label="Users" className="cell-num">{r.userCount ?? 0}</td>
                    {canManage && (
                      <td data-label="Actions" className="row-actions">
                        <button type="button" className="btn btn-ghost btn-icon btn-sm" data-tip="Edit" onClick={() => openForm(r)} aria-label={`Edit ${r.name}`}>
                          <Pencil size={16} aria-hidden="true" />
                        </button>
                        <button type="button" className="btn btn-ghost btn-icon btn-sm btn-danger-icon" data-tip="Delete" onClick={() => setToDelete(r)} aria-label={`Delete ${r.name}`}>
                          <Trash2 size={16} aria-hidden="true" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ChipsLegend />
        </>
      )}

      <Modal open={!!form} title={form?.id ? 'Edit role' : 'Add role'} titleId="role-form-title" onClose={closeForm} wide>
        {form && (
          <form onSubmit={submit} noValidate aria-labelledby="role-form-title">
            <ErrorBanner error={formError} />
            <Field id="role-name" label="Name *" error={errors.name}>
              <input id="role-name" name="name" autoComplete="off" value={form.name} maxLength={50} autoFocus
                {...fieldAria('role-name', errors.name)} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field id="role-desc" label="Description" error={errors.description}>
              <textarea id="role-desc" name="description" rows={2} maxLength={255} value={form.description}
                {...fieldAria('role-desc', errors.description)} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            {groups.map((g) => (
              <fieldset key={g} className="perm-group">
                <legend>{groupLabel(g)} permissions</legend>
                <div className="perm-grid">
                  {permissions.filter((p) => p.group === g).map((p) => (
                    <div key={p.key} className="check-tile">
                      <input id={`perm-${p.key}`} type="checkbox" checked={form.permissions.includes(p.key)}
                        onChange={(e) => togglePermission(p.key, e.target.checked)} />
                      <label htmlFor={`perm-${p.key}`}>{p.label}</label>
                      <span className="check-key" translate="no">{p.key}</span>
                    </div>
                  ))}
                </div>
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
        message={toDelete ? `Delete role “${toDelete.name}”? This cannot be undone.` : ''}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </section>
  )
}
