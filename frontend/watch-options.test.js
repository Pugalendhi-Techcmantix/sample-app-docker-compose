import { describe, expect, it } from 'vitest'
import { watchOptions } from './watch-options.js'

describe('watchOptions', () => {
  it('enables polling only when VITE_USE_POLLING is "true"', () => {
    expect(watchOptions({ VITE_USE_POLLING: 'true' })).toEqual({ usePolling: true, interval: 300 })
    expect(watchOptions({ VITE_USE_POLLING: 'false' })).toBeUndefined()
    expect(watchOptions({})).toBeUndefined()
  })
})
