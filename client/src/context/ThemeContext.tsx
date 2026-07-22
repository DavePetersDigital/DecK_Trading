import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useState,
  type ReactNode,
} from 'react'
import {
  applyResolvedTheme,
  DEFAULT_THEME_PREFERENCE,
  getSystemPrefersDark,
  readStoredThemePreference,
  resolveTheme,
  writeStoredThemePreference,
  type ResolvedTheme,
  type ThemePreference,
} from '../theme/theme'

interface ThemeContextValue {
  preference: ThemePreference
  resolvedTheme: ResolvedTheme
  setThemePreference: (preference: ThemePreference) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function initialPreference(): ThemePreference {
  return readStoredThemePreference() ?? DEFAULT_THEME_PREFERENCE
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(initialPreference)
  const [systemPrefersDark, setSystemPrefersDark] = useState(() => getSystemPrefersDark())
  const resolvedTheme = resolveTheme(preference, systemPrefersDark)

  const onSystemSchemeChange = useEffectEvent((matches: boolean) => {
    setSystemPrefersDark(matches)
  })

  useEffect(() => {
    applyResolvedTheme(resolvedTheme)
    writeStoredThemePreference(preference)
  }, [preference, resolvedTheme])

  useEffect(() => {
    if (preference !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const listener = (event: MediaQueryListEvent) => onSystemSchemeChange(event.matches)
    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
  }, [preference])

  const setThemePreference = (next: ThemePreference) => {
    setPreference(next)
  }

  return (
    <ThemeContext.Provider value={{ preference, resolvedTheme, setThemePreference }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme must be used within ThemeProvider')
  return value
}
