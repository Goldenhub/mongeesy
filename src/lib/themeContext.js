import { createContext } from 'react'

export const ThemeContext = createContext({ theme: 'light', toggle: () => {} })
export const THEME_STORAGE_KEY = 'mongeesy-theme'
