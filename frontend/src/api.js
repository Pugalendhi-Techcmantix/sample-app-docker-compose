export class ApiError extends Error {
  constructor(status, message, details) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }
}

async function request(method, path, body) {
  let res
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'Cannot reach server')
  }
  if (res.status === 204) return null
  let data = null
  try {
    data = await res.json()
  } catch {
    // non-JSON body (e.g. proxy error page)
  }
  if (!res.ok) {
    const e = data?.error
    throw new ApiError(res.status, e?.message || `Request failed (${res.status})`, e?.details)
  }
  return data
}

const resource = (name) => ({
  list: () => request('GET', `/${name}`),
  get: (id) => request('GET', `/${name}/${id}`),
  create: (data) => request('POST', `/${name}`, data),
  update: (id, data) => request('PUT', `/${name}/${id}`, data),
  remove: (id) => request('DELETE', `/${name}/${id}`),
})

const roles = resource('roles')
const users = resource('users')

export const listRoles = roles.list
export const getRole = roles.get
export const createRole = roles.create
export const updateRole = roles.update
export const deleteRole = roles.remove
export const listUsers = users.list
export const getUser = users.get
export const createUser = users.create
export const updateUser = users.update
export const deleteUser = users.remove
