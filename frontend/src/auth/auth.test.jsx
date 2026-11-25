import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { makeUser, renderApp, res } from '../test-render.jsx'

const signIn = async (user, email = 'ada@x.com', password = 'secret123') => {
  await user.type(await screen.findByLabelText('Email'), email)
  await user.type(screen.getByLabelText('Password'), password)
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe('login', () => {
  it('signs in and lands on the dashboard', async () => {
    const user = userEvent.setup()
    const { calls } = renderApp('/login', {
      user: null,
      handler: (url, method) => (url.endsWith('/auth/login') ? res(200, { user: makeUser() }) : undefined),
    })
    await signIn(user)
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeTruthy()
    const login = calls.mock.calls.find(([u]) => u.endsWith('/auth/login'))
    expect(JSON.parse(login[1].body)).toEqual({ email: 'ada@x.com', password: 'secret123' })
  })

  it('shows the generic error on a failed login and stays on the form', async () => {
    const user = userEvent.setup()
    renderApp('/login', {
      user: null,
      handler: (url) => (url.endsWith('/auth/login') ? res(401, { error: { message: 'Invalid email or password' } }) : undefined),
    })
    await signIn(user, 'ada@x.com', 'wrongwrong')
    expect((await screen.findByRole('alert')).textContent).toContain('Invalid email or password')
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy()
  })

  it('validates empty fields without calling the API', async () => {
    const user = userEvent.setup()
    const { calls } = renderApp('/login', { user: null })
    await user.click(await screen.findByRole('button', { name: 'Sign in' }))
    expect(screen.getByText('Email is required')).toBeTruthy()
    expect(screen.getByText('Password is required')).toBeTruthy()
    expect(calls.mock.calls.some(([u]) => u.endsWith('/auth/login'))).toBe(false)
  })

  it('redirects a signed-out visitor to /login and returns to the page after sign-in', async () => {
    const user = userEvent.setup()
    renderApp('/roles', {
      user: null,
      handler: (url) => (url.endsWith('/auth/login') ? res(200, { user: makeUser() }) : undefined),
    })
    expect(await screen.findByRole('form', { name: 'Sign in' })).toBeTruthy()
    await signIn(user)
    expect(await screen.findByRole('heading', { name: 'Roles' })).toBeTruthy()
  })

  it('redirects a signed-in user away from /login', async () => {
    renderApp('/login')
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeTruthy()
  })

  it('logs out through the user menu', async () => {
    const user = userEvent.setup()
    const { calls } = renderApp('/')
    await user.click(await screen.findByRole('button', { name: /Ada Admin/ }))
    await user.click(screen.getByRole('menuitem', { name: /Log out/ }))
    expect(await screen.findByRole('form', { name: 'Sign in' })).toBeTruthy()
    expect(calls.mock.calls.some(([u, o]) => u.endsWith('/auth/logout') && o.method === 'POST')).toBe(true)
  })
})

describe('session expiry', () => {
  it('a 401 on a normal call sends the user to /login', async () => {
    renderApp('/users', {
      handler: (url) => (url.endsWith('/users') ? res(401, { error: { message: 'Not signed in' } }) : undefined),
    })
    expect(await screen.findByRole('form', { name: 'Sign in' })).toBeTruthy()
  })

  it('a 401 from /auth/login is shown as an error, not treated as expiry', async () => {
    const user = userEvent.setup()
    renderApp('/login', {
      user: null,
      handler: (url) => (url.endsWith('/auth/login') ? res(401, { error: { message: 'Invalid email or password' } }) : undefined),
    })
    await signIn(user)
    await screen.findByText('Invalid email or password')
  })
})

describe('permissions', () => {
  it('filters the sidebar by permission', async () => {
    renderApp('/', { user: makeUser(['users.view']) })
    const nav = await screen.findByRole('navigation', { name: 'Main' })
    expect(nav.textContent).toContain('Users')
    expect(nav.textContent).not.toContain('Roles')
    expect(nav.textContent).toContain('Dashboard')
  })

  it('shows the 403 page for a direct URL without permission', async () => {
    renderApp('/roles', { user: makeUser(['users.view']) })
    expect(await screen.findByText(/403/)).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Roles' })).toBeNull()
  })

  it('shows the 404 page for unknown URLs', async () => {
    renderApp('/nope')
    expect(await screen.findByText(/404/)).toBeTruthy()
  })

  it('dashboard shows counts only for what the user may view, plus role chips', async () => {
    renderApp('/', { user: makeUser(['users.view']) })
    expect(await screen.findByLabelText('Users count')).toBeTruthy()
    expect(screen.queryByLabelText('Roles count')).toBeNull()
    // the recent-users list also shows role names, so look inside the "Your access" card
    const access = screen.getByRole('region', { name: 'Your access' })
    expect(within(access).getByText('Admin')).toBeTruthy()
    expect(within(access).getAllByText('users.view').length).toBeGreaterThan(0)
  })
})

describe('theme', () => {
  it('toggles and saves the theme', async () => {
    const user = userEvent.setup()
    renderApp('/')
    await user.click(await screen.findByRole('button', { name: /Ada Admin/ }))
    await user.click(screen.getByRole('menuitemradio', { name: 'Dark' }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem('theme')).toBe('dark')
    await user.click(screen.getByRole('menuitemradio', { name: 'System' }))
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })
})

describe('profile / change password', () => {
  const open = async (handler) => {
    const user = userEvent.setup()
    const utils = renderApp('/profile', { handler })
    await screen.findByRole('form', { name: 'Change password' })
    return { user, ...utils }
  }

  it('validates locally', async () => {
    const { user, calls } = await open()
    await user.type(screen.getByLabelText('Current password'), 'oldpassword')
    await user.type(screen.getByLabelText('New password'), 'short')
    await user.click(screen.getByRole('button', { name: 'Change password' }))
    expect(await screen.findByText('New password must be at least 8 characters')).toBeTruthy()
    expect(calls.mock.calls.some(([u]) => u.endsWith('/change-password'))).toBe(false)
  })

  it('maps server field errors', async () => {
    const { user } = await open((url) =>
      url.endsWith('/auth/change-password')
        ? res(400, { error: { message: 'Validation failed', details: [{ field: 'currentPassword', message: 'Current password is incorrect' }] } })
        : undefined,
    )
    await user.type(screen.getByLabelText('Current password'), 'wrongwrong')
    await user.type(screen.getByLabelText('New password'), 'newpassword1')
    await user.type(screen.getByLabelText('Confirm new password'), 'newpassword1')
    await user.click(screen.getByRole('button', { name: 'Change password' }))
    expect(await screen.findByText('Current password is incorrect')).toBeTruthy()
  })

  it('shows a success toast and clears the form', async () => {
    const { user, calls } = await open()
    await user.type(screen.getByLabelText('Current password'), 'oldpassword')
    await user.type(screen.getByLabelText('New password'), 'newpassword1')
    await user.type(screen.getByLabelText('Confirm new password'), 'newpassword1')
    await user.click(screen.getByRole('button', { name: 'Change password' }))
    expect(await screen.findByText('Password changed')).toBeTruthy()
    await waitFor(() => expect(screen.getByLabelText('Current password').value).toBe(''))
    const call = calls.mock.calls.find(([u]) => u.endsWith('/auth/change-password'))
    expect(JSON.parse(call[1].body)).toEqual({ currentPassword: 'oldpassword', newPassword: 'newpassword1' })
  })
})
