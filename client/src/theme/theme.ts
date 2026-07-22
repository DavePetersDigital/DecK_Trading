export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'theme'
export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'light'

const LEGACY_SETTINGS_KEY = 'dp-settings'

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system'
}

/** Map legacy AppSettings theme values (`dark` | `slate`) onto the new preference model. */
export function migrateLegacyTheme(value: unknown): ThemePreference | null {
  if (isThemePreference(value)) return value
  if (value === 'slate') return 'dark'
  return null
}

export function readStoredThemePreference(
  storage: Pick<Storage, 'getItem'> = localStorage,
): ThemePreference | null {
  try {
    const direct = storage.getItem(THEME_STORAGE_KEY)
    if (isThemePreference(direct)) return direct

    const rawSettings = storage.getItem(LEGACY_SETTINGS_KEY)
    if (!rawSettings) return null
    const parsed = JSON.parse(rawSettings) as { theme?: unknown }
    return migrateLegacyTheme(parsed.theme)
  } catch {
    return null
  }
}

export function writeStoredThemePreference(
  preference: ThemePreference,
  storage: Pick<Storage, 'setItem'> = localStorage,
): void {
  storage.setItem(THEME_STORAGE_KEY, preference)
}

export function getSystemPrefersDark(
  media: Pick<MediaQueryList, 'matches'> | null = typeof window !== 'undefined'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null,
): boolean {
  return media?.matches === true
}

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark = getSystemPrefersDark(),
): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light'
  return preference
}

export function applyResolvedTheme(
  resolved: ResolvedTheme,
  root: HTMLElement = document.documentElement,
): void {
  root.dataset.theme = resolved
}

export function initialiseThemeFromStorage(
  storage: Pick<Storage, 'getItem'> = localStorage,
  root: HTMLElement = document.documentElement,
  systemPrefersDark = getSystemPrefersDark(),
): { preference: ThemePreference; resolvedTheme: ResolvedTheme } {
  const preference = readStoredThemePreference(storage) ?? DEFAULT_THEME_PREFERENCE
  const resolvedTheme = resolveTheme(preference, systemPrefersDark)
  applyResolvedTheme(resolvedTheme, root)
  return { preference, resolvedTheme }
}
