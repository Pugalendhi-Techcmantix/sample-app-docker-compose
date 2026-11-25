import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, createUser, deleteRole, listRoles } from './api.js'

const json = (status, body) => ({ ok: status < 400, status, json: async () => body })

afterEach(() => vi.unstubAllGlobals())

describe('api client', () => {
  it('maps an error body to ApiError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(409, { error: { message: 'Email already exists' } })))
    const err = await createUser({}).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(409)
    expect(err.message).toBe('Email already exists')
  })

  it('keeps validation details', async () => {
    const details = [{ field: 'roleId', message: 'Role does not exist' }]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(400, { error: { message: 'Validation failed', details } })))
    const err = await createUser({}).catch((e) => e)
    expect(err.details).toEqual(details)
  })

  it('maps a network failure to status 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fail')))
    const err = await listRoles().catch((e) => e)
    expect(err.status).toBe(0)
    expect(err.message).toBe('Cannot reach server')
  })

  it('returns null for 204 and parsed JSON otherwise', async () => {
    const f = vi.fn().mockResolvedValueOnce({ ok: true, status: 204 }).mockResolvedValueOnce(json(200, [{ id: 1 }]))
    vi.stubGlobal('fetch', f)
    expect(await deleteRole(1)).toBeNull()
    expect(await listRoles()).toEqual([{ id: 1 }])
    expect(f.mock.calls[0][0]).toBe('/api/roles/1')
    expect(f.mock.calls[0][1].method).toBe('DELETE')
  })
})
