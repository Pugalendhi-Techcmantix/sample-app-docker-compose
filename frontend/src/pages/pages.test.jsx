import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { networkError } from '../test-utils.js'
import { makeUser, renderApp, res, ROLES } from '../test-render.jsx'

const post = (calls) => calls.mock.calls.find(([, o]) => o.method === 'POST')
const put = (calls) => calls.mock.calls.find(([, o]) => o.method === 'PUT')

describe('RolesPage', () => {
  it('renders loading, then roles with chips and user count', async () => {
    renderApp('/roles')
    expect(await screen.findByText('All access')).toBeTruthy()
    expect(screen.getAllByText('users.view').length).toBeGreaterThan(0)
    expect(screen.getByRole('cell', { name: '2' })).toBeTruthy()
  })

  it('shows the empty state', async () => {
    renderApp('/roles', { handler: (url) => (url.endsWith('/roles') ? res(200, []) : undefined) })
    expect(await screen.findByText('No roles yet.')).toBeTruthy()
  })

  it('shows an error banner when the server is unreachable', async () => {
    renderApp('/roles', { handler: (url) => (url.endsWith('/roles') ? networkError() : undefined) })
    expect(await screen.findByText('Cannot reach server')).toBeTruthy()
  })

  it('sends the ticked permissions, grouped checkboxes from /permissions', async () => {
    const user = userEvent.setup()
    const { calls } = renderApp('/roles')
    await screen.findByText('All access')
    await user.click(screen.getByRole('button', { name: 'Add role' }))
    expect(screen.getByRole('group', { name: 'Users permissions' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Roles permissions' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Name is required')).toBeTruthy() // client-side
    await user.type(screen.getByLabelText('Name *'), 'Auditor')
    await user.click(screen.getByLabelText('View users'))
    await user.click(screen.getByLabelText('View roles'))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(post(calls)).toBeTruthy())
    expect(JSON.parse(post(calls)[1].body)).toEqual({
      name: 'Auditor', description: null, permissions: ['users.view', 'roles.view'],
    })
  })

  it('prefills permissions when editing', async () => {
    const user = userEvent.setup()
    const { calls } = renderApp('/roles')
    await user.click(await screen.findByRole('button', { name: 'Edit Staff' }))
    expect(screen.getByLabelText('View users').checked).toBe(true)
    expect(screen.getByLabelText('Manage roles').checked).toBe(false)
    await user.click(screen.getByLabelText('Manage roles'))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(put(calls)).toBeTruthy())
    expect(JSON.parse(put(calls)[1].body).permissions).toEqual(['users.view', 'roles.manage'])
  })

  it('shows a server validation error under the field', async () => {
    const user = userEvent.setup()
    renderApp('/roles', {
      handler: (url, method) =>
        method === 'POST'
          ? res(400, { error: { message: 'Validation failed', details: [{ field: 'name', message: 'Name too long' }] } })
          : undefined,
    })
    await screen.findByText('All access')
    await user.click(screen.getByRole('button', { name: 'Add role' }))
    await user.type(screen.getByLabelText('Name *'), 'X')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Name too long')).toBeTruthy()
  })

  it('shows the 409 message when deleting a role in use', async () => {
    const user = userEvent.setup()
    renderApp('/roles', {
      handler: (url, method) =>
        method === 'DELETE' ? res(409, { error: { message: 'Role is assigned to 2 user(s)' } }) : undefined,
    })
    await user.click(await screen.findByRole('button', { name: 'Delete Admin' }))
    const dialog = document.querySelector('dialog[aria-labelledby="confirm-title"]')
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Role is assigned to 2 user(s)'))
  })

  it('is read-only without roles.manage', async () => {
    renderApp('/roles', { user: makeUser(['roles.view']) })
    await screen.findByText('All access')
    expect(screen.queryByRole('button', { name: 'Add role' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit Admin' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete Admin' })).toBeNull()
  })
})

describe('UsersPage', () => {
  it('lists users with role and status, and filters with the search box', async () => {
    const user = userEvent.setup()
    renderApp('/users')
    expect(await screen.findByText('Asha K')).toBeTruthy()
    expect(screen.getByText('Inactive')).toBeTruthy()
    await user.type(screen.getByLabelText('Search users'), 'ada')
    expect(screen.queryByText('Asha K')).toBeNull()
    expect(screen.getByRole('cell', { name: 'Ada Admin' })).toBeTruthy()
    await user.clear(screen.getByLabelText('Search users'))
    await user.type(screen.getByLabelText('Search users'), 'zzz')
    expect(screen.getByText('No users match your search.')).toBeTruthy()
  })

  it('requires a password on create and sends it with the role from /roles/options', async () => {
    const user = userEvent.setup()
    const { calls } = renderApp('/users')
    await screen.findByText('Asha K')
    await user.click(screen.getByRole('button', { name: 'Add user' }))
    await user.type(screen.getByLabelText('Full name *'), 'Bob')
    await user.type(screen.getByLabelText('Email *'), 'bob@x.com')
    await user.selectOptions(screen.getByLabelText('Role *'), '2')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Password is required')).toBeTruthy()
    expect(post(calls)).toBeUndefined()
    await user.type(screen.getByLabelText('Password *'), 'secret123')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(post(calls)).toBeTruthy())
    expect(JSON.parse(post(calls)[1].body)).toEqual({
      fullName: 'Bob', email: 'bob@x.com', roleId: 2, isActive: true, password: 'secret123',
    })
  })

  it('leaves the password out on edit when blank', async () => {
    const user = userEvent.setup()
    const { calls } = renderApp('/users')
    await user.click(await screen.findByRole('button', { name: 'Edit Asha K' }))
    expect(screen.getByText('Leave blank to keep the current password')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(put(calls)).toBeTruthy())
    expect('password' in JSON.parse(put(calls)[1].body)).toBe(false)
  })

  it('validates the email client-side and shows the duplicate-email 409', async () => {
    const user = userEvent.setup()
    const { calls } = renderApp('/users', {
      handler: (url, method) =>
        method === 'POST' ? res(409, { error: { message: 'Email already exists' } }) : undefined,
    })
    await screen.findByText('Asha K')
    await user.click(screen.getByRole('button', { name: 'Add user' }))
    await user.type(screen.getByLabelText('Full name *'), 'Bob')
    await user.type(screen.getByLabelText('Email *'), 'nope')
    await user.type(screen.getByLabelText('Password *'), 'secret123')
    await user.selectOptions(screen.getByLabelText('Role *'), '1')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Enter a valid email address')).toBeTruthy()
    expect(post(calls)).toBeUndefined()
    await user.clear(screen.getByLabelText('Email *'))
    await user.type(screen.getByLabelText('Email *'), 'asha@x.com')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Email already exists')).toBeTruthy()
  })

  it('shows a non-field 409 inside the form', async () => {
    const user = userEvent.setup()
    renderApp('/users', {
      handler: (url, method) =>
        method === 'PUT'
          ? res(409, { error: { message: 'You cannot deactivate your own account' } })
          : undefined,
    })
    await user.click(await screen.findByRole('button', { name: 'Edit Ada Admin' }))
    await user.click(screen.getByLabelText('Active'))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    // field mapping falls back to email for plain 409s; the message must still be visible
    expect(await screen.findByText('You cannot deactivate your own account')).toBeTruthy()
  })

  it('hides action buttons the user may not use', async () => {
    renderApp('/users', { user: makeUser(['users.view', 'users.edit']) })
    await screen.findByText('Asha K')
    expect(screen.queryByRole('button', { name: 'Add user' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Edit Asha K' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Delete Asha K' })).toBeNull()
  })

  it('asks to create a role first when none exist', async () => {
    const user = userEvent.setup()
    renderApp('/users', {
      handler: (url) => (url.endsWith('/roles/options') ? res(200, []) : undefined),
    })
    await screen.findByText('Asha K')
    await user.click(screen.getByRole('button', { name: 'Add user' }))
    expect(screen.getByText(/Create a role first/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Go to Roles' }).getAttribute('href')).toBe('/roles')
  })

  it('deletes after confirmation', async () => {
    const user = userEvent.setup()
    const { calls } = renderApp('/users')
    await user.click(await screen.findByRole('button', { name: 'Delete Asha K' }))
    await user.click(within(document.querySelector('dialog[aria-labelledby="confirm-title"]')).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(calls.mock.calls.some(([u, o]) => o.method === 'DELETE' && u.endsWith('/users/2'))).toBe(true))
  })
})

describe('ROLES fixture sanity', () => {
  it('has the roles the tests rely on', () => {
    expect(ROLES.map((r) => r.name)).toEqual(['Admin', 'Staff'])
  })
})
