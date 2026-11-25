import { useCallback, useState } from 'react'

const KEY = 'theme'
export const THEMES = ['light', 'dark', 'system']

export function getStoredTheme() {
  try {
    const v = localStorage.getItem(KEY)
    return THEMES.includes(v) ? v : 'system'
  } catch {
    return 'system'
  }
}

// "system" removes the attribute so the prefers-color-scheme media query decides.
export function applyTheme(theme) {
  const root = document.documentElement
  if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme)
  else root.removeAttribute('data-theme')
}

export function useTheme() {
  const [theme, setThemeState] = useState(getStoredTheme)
  const setTheme = useCallback((t) => {
    setThemeState(t)
    applyTheme(t)
    try {
      localStorage.setItem(KEY, t)
    } catch {
      // storage unavailable: the theme still applies for this session
    }
  }, [])
  return [theme, setTheme]
}
