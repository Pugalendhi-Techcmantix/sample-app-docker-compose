import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, createUser, deleteRole, http, listRoles, login, logout, me, setUnauthorizedHandler } from './api.js'
import { mockApi, networkError } from './test-utils.js'

const json = (status, body) => ({ status, json: body })

describe('api client', () => {
  it('maps an error body to ApiError', async () => {
    mockApi(() => json(409, { error: { message: 'Email already exists' } }))
    const err = await createUser({}).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(409)
    expect(err.message).toBe('Email already exists')
  })

  it('keeps validation details', async () => {
    const details = [{ field: 'roleId', message: 'Role does not exist' }]
    mockApi(() => json(400, { error: { message: 'Validation failed', details } }))
    const err = await createUser({}).catch((e) => e)
    expect(err.details).toEqual(details)
  })

  it('maps a network failure to status 0', async () => {
    mockApi(networkError)
    const err = await listRoles().catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(0)
    expect(err.message).toBe('Cannot reach server')
  })

  it('returns null for 204 and parsed JSON otherwise', async () => {
    const calls = mockApi((url, method) => (method === 'DELETE' ? json(204) : json(200, [{ id: 1 }])))
    expect(await deleteRole(1)).toBeNull()
    expect(await listRoles()).toEqual([{ id: 1 }])
    expect(calls.mock.calls[0][0]).toBe('/api/roles/1')
    expect(calls.mock.calls[0][1].method).toBe('DELETE')
  })

  it('sends JSON and has a timeout', async () => {
    const calls = mockApi(() => json(201, { id: 1 }))
    await createUser({ fullName: 'A' })
    expect(JSON.parse(calls.mock.calls[0][1].body)).toEqual({ fullName: 'A' })
    expect(http.defaults.timeout).toBe(15000)
  })
})

describe('auth handling', () => {
  afterEach(() => setUnauthorizedHandler(null))

  it('sends cookies with every request', () => {
    expect(http.defaults.withCredentials).toBe(true)
  })

  it('calls the unauthorized handler on a 401, except for login/me/logout', async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    mockApi(() => json(401, { error: { message: 'Not signed in' } }))
    await listRoles().catch(() => {})
    expect(handler).toHaveBeenCalledTimes(1)
    await login({}).catch(() => {})
    await me().catch(() => {})
    await logout().catch(() => {})
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('does not call it for other statuses', async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    mockApi(() => json(403, { error: { message: 'Forbidden' } }))
    const err = await listRoles().catch((e) => e)
    expect(err.status).toBe(403)
    expect(handler).not.toHaveBeenCalled()
  })
})

describe('base URL', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('normalizes the configured value', async () => {
    const { normalizeBase } = await import('./api.js')
    expect(normalizeBase(undefined)).toBe('/api')
    expect(normalizeBase('')).toBe('/api')
    expect(normalizeBase('http://localhost:4000/api/')).toBe('http://localhost:4000/api')
    expect(normalizeBase('/api')).toBe('/api')
  })

  it('defaults to /api', async () => {
    vi.stubEnv('VITE_API_URL', '')
    vi.resetModules()
    const api = await import('./api.js')
    const { mockApi: mock } = await import('./test-utils.js')
    const calls = mock(() => json(200, []), api.http)
    await api.listRoles()
    expect(calls.mock.calls[0][0]).toBe('/api/roles')
  })

  it('uses VITE_API_URL without a trailing slash', async () => {
    vi.stubEnv('VITE_API_URL', 'http://localhost:4000/api/')
    vi.resetModules()
    const api = await import('./api.js')
    const { mockApi: mock } = await import('./test-utils.js')
    const calls = mock(() => json(200, []), api.http)
    await api.listUsers()
    expect(calls.mock.calls[0][0]).toBe('http://localhost:4000/api/users')
  })
})
