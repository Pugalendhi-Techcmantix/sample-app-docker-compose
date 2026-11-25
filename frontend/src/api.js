import axios from 'axios'

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }
}

export const normalizeBase = (v) => (v || '/api').trim().replace(/\/+$/, '') || '/api'

export const http = axios.create({
  baseURL: normalizeBase(import.meta.env.VITE_API_URL),
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
})

// Single place where transport/HTTP errors become ApiError.
http.interceptors.response.use(
  (res) => (res.status === 204 ? null : res.data),
  (err) => {
    const res = err.response
    if (!res) return Promise.reject(new ApiError(0, 'Cannot reach server'))
    const e = res.data?.error
    return Promise.reject(new ApiError(res.status, e?.message || `Request failed (${res.status})`, e?.details))
  },
)

const resource = (name) => ({
  list: () => http.get(`/${name}`),
  get: (id) => http.get(`/${name}/${id}`),
  create: (data) => http.post(`/${name}`, data),
  update: (id, data) => http.put(`/${name}/${id}`, data),
  remove: (id) => http.delete(`/${name}/${id}`),
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
