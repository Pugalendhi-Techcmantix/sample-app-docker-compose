import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import * as api from '../api.js'

export const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    try {
      const res = await api.me()
      setUser(res.user)
      setError(null)
      return res.user
    } catch (e) {
      setUser(null)
      setError(e.status === 401 ? null : e)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Any 401 on a normal call means the session is gone.
  useEffect(() => {
    api.setUnauthorizedHandler(() => setUser(null))
    return () => api.setUnauthorizedHandler(null)
  }, [])

  const login = useCallback(async (email, password) => {
    const res = await api.login({ email, password })
    setUser(res.user)
    setError(null)
    return res.user
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.logout()
    } finally {
      setUser(null)
    }
  }, [])

  const can = useCallback((permission) => !!user?.permissions?.includes(permission), [user])

  const value = useMemo(
    () => ({ user, loading, error, login, logout, can, refresh }),
    [user, loading, error, login, logout, can, refresh],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
