import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from './App.jsx'
import { AuthProvider } from './auth/AuthContext.jsx'
import { ToastProvider } from './components/Toast.jsx'
import { mockApi } from './test-utils.js'

export const res = (status, json) => ({ status, json })

export const ALL_PERMISSIONS = ['users.view', 'users.create', 'users.edit', 'users.delete', 'roles.view', 'roles.manage']

export const makeUser = (permissions = ALL_PERMISSIONS, over = {}) => ({
  id: 1, fullName: 'Ada Admin', email: 'ada@x.com', roleId: 1, roleName: 'Admin', isActive: true, permissions, ...over,
})

export const ROLES = [
  { id: 1, name: 'Admin', description: 'All access', permissions: ALL_PERMISSIONS, userCount: 2 },
  { id: 2, name: 'Staff', description: null, permissions: ['users.view'], userCount: 0 },
]
export const PERMISSIONS = [
  { key: 'users.view', group: 'users', label: 'View users' },
  { key: 'users.create', group: 'users', label: 'Create users' },
  { key: 'roles.view', group: 'roles', label: 'View roles' },
  { key: 'roles.manage', group: 'roles', label: 'Manage roles' },
]
export const USERS = [
  { id: 1, fullName: 'Ada Admin', email: 'ada@x.com', roleId: 1, roleName: 'Admin', isActive: true },
  { id: 2, fullName: 'Asha K', email: 'asha@x.com', roleId: 2, roleName: 'Staff', isActive: false },
]

// Default GET responses; `handler` (url, method, { body }) can override any call by returning a response.
function defaults(url, method) {
  if (method !== 'GET') return res(204)
  if (url.endsWith('/roles/options')) return res(200, ROLES.map(({ id, name }) => ({ id, name })))
  if (url.endsWith('/permissions')) return res(200, PERMISSIONS)
  if (url.endsWith('/roles')) return res(200, ROLES)
  if (url.endsWith('/users')) return res(200, USERS)
  return res(404, { error: { message: 'Not found' } })
}

// Renders the real App (router, auth, toasts) against an adapter-level API mock.
// `user: null` means /auth/me answers 401.
export function renderApp(route, { user = makeUser(), handler } = {}) {
  const calls = mockApi((url, method, opts) => {
    if (url.endsWith('/auth/me')) {
      return user ? res(200, { user }) : res(401, { error: { message: 'Not signed in' } })
    }
    return handler?.(url, method, opts) ?? defaults(url, method)
  })
  const utils = render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>,
  )
  return { ...utils, calls }
}
