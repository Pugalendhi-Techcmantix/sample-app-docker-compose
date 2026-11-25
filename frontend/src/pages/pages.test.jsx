import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import RolesPage from './RolesPage.jsx'
import UsersPage from './UsersPage.jsx'

// jsdom has no <dialog> modal support
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
afterEach(() => vi.unstubAllGlobals())

const res = (status, body) => ({ ok: status < 400, status, json: async () => body })
const mockFetch = (handler) => {
  const f = vi.fn(async (url, opts = {}) => handler(url, opts.method || 'GET', opts))
  vi.stubGlobal('fetch', f)
  return f
}
const renderPage = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>)

const ROLES = [
  { id: 1, name: 'Admin', description: 'All access' },
  { id: 2, name: 'Staff', description: null },
]

describe('RolesPage', () => {
  it('renders loading, then the list', async () => {
    mockFetch(() => res(200, ROLES))
    renderPage(<RolesPage />)
    expect(screen.getByText('Loading…')).toBeTruthy()
    expect(await screen.findByText('Admin')).toBeTruthy()
    expect(screen.getByText('All access')).toBeTruthy()
  })

  it('allows long unbroken names to wrap', async () => {
    mockFetch(() => res(200, [{ id: 1, name: 'A'.repeat(50), description: 'd'.repeat(200) }]))
    renderPage(<RolesPage />)
    const cell = (await screen.findByText('A'.repeat(50))).closest('td')
    expect(cell.className).toContain('break')
  })

  it('shows the empty state', async () => {
    mockFetch(() => res(200, []))
    renderPage(<RolesPage />)
    expect(await screen.findByText('No roles yet.')).toBeTruthy()
  })

  it('shows an error banner when the server is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('x')))
    renderPage(<RolesPage />)
    expect((await screen.findByRole('alert')).textContent).toContain('Cannot reach server')
  })

  it('shows a server validation error under the field', async () => {
    mockFetch((url, method) =>
      method === 'POST'
        ? res(400, { error: { message: 'Validation failed', details: [{ field: 'name', message: 'Name too long' }] } })
        : res(200, ROLES),
    )
    const user = userEvent.setup()
    renderPage(<RolesPage />)
    await screen.findByText('Admin')
    await user.click(screen.getByRole('button', { name: 'Add role' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Name is required')).toBeTruthy() // client-side
    await user.type(screen.getByLabelText('Name *'), 'X')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Name too long')).toBeTruthy()
  })

  it('shows the 409 message when deleting a role in use', async () => {
    mockFetch((url, method) =>
      method === 'DELETE' ? res(409, { error: { message: 'Role is assigned to 2 user(s)' } }) : res(200, ROLES),
    )
    const user = userEvent.setup()
    renderPage(<RolesPage />)
    await user.click(await screen.findByRole('button', { name: 'Delete Admin' }))
    const dialog = document.querySelector('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Role is assigned to 2 user(s)'))
  })
})

describe('UsersPage', () => {
  const USERS = [{ id: 1, fullName: 'Asha K', email: 'asha@x.com', roleId: 1, roleName: 'Admin', isActive: false }]
  const base = (url) => (url.endsWith('/users') ? res(200, USERS) : res(200, ROLES))

  it('lists users with role and status', async () => {
    mockFetch(base)
    renderPage(<UsersPage />)
    expect(await screen.findByText('Asha K')).toBeTruthy()
    expect(screen.getByText('Inactive')).toBeTruthy()
    expect(screen.getByText('Admin')).toBeTruthy()
  })

  it('validates the email client-side and shows the duplicate-email 409', async () => {
    const f = mockFetch((url, method) =>
      method === 'POST' ? res(409, { error: { message: 'Email already exists' } }) : base(url),
    )
    const user = userEvent.setup()
    renderPage(<UsersPage />)
    await screen.findByText('Asha K')
    await user.click(screen.getByRole('button', { name: 'Add user' }))
    await user.type(screen.getByLabelText('Full name *'), 'Bob')
    await user.type(screen.getByLabelText('Email *'), 'nope')
    await user.selectOptions(screen.getByLabelText('Role *'), '1')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Enter a valid email address')).toBeTruthy()
    expect(f.mock.calls.some(([, o]) => o?.method === 'POST')).toBe(false)
    await user.clear(screen.getByLabelText('Email *'))
    await user.type(screen.getByLabelText('Email *'), 'asha@x.com')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Email already exists')).toBeTruthy()
    const post = f.mock.calls.find(([, o]) => o?.method === 'POST')
    expect(JSON.parse(post[1].body)).toEqual({ fullName: 'Bob', email: 'asha@x.com', roleId: 1, isActive: true })
  })

  it('asks to create a role first when none exist', async () => {
    mockFetch((url) => res(200, []))
    const user = userEvent.setup()
    renderPage(<UsersPage />)
    await screen.findByText('No users yet.')
    await user.click(screen.getByRole('button', { name: 'Add user' }))
    expect(screen.getByText(/Create a role first/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Go to Roles' }).getAttribute('href')).toBe('/roles')
  })
})
