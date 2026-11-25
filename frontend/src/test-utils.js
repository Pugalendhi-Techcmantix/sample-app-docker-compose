import { vi } from 'vitest'
import { AxiosError } from 'axios'
import { http } from './api.js'

// Replaces the axios adapter. handler(url, method, { body }) returns
// { status, json } or throws to simulate a network failure. Returns a vi.fn of the calls.
export function mockApi(handler, instance = http) {
  const calls = vi.fn()
  instance.defaults.adapter = async (config) => {
    const url = `${config.baseURL ?? ''}${config.url}`
    const method = config.method.toUpperCase()
    calls(url, { method, body: config.data })
    const { status, json } = await handler(url, method, { body: config.data })
    const response = { data: json, status, statusText: '', headers: {}, config, request: {} }
    if (status >= 200 && status < 300) return response
    throw new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_RESPONSE', config, {}, response)
  }
  return calls
}

export const networkError = () => {
  throw new AxiosError('Network Error', 'ERR_NETWORK')
}
