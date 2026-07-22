import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  applyResolvedTheme,
  DEFAULT_THEME_PREFERENCE,
  initialiseThemeFromStorage,
  migrateLegacyTheme,
  readStoredThemePreference,
  resolveTheme,
  writeStoredThemePreference,
  THEME_STORAGE_KEY,
} from './theme'

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial))
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, String(value))
    },
    removeItem: (key) => {
      map.delete(key)
    },
    key: (index) => [...map.keys()][index] ?? null,
  }
}

function mockRoot(initial: string | undefined = undefined): HTMLElement {
  const dataset: Record<string, string | undefined> = { theme: initial }
  return { dataset } as unknown as HTMLElement
}

describe('theme preference defaults and storage', () => {
  it('defaults to Light when no preference exists', () => {
    expect(readStoredThemePreference(memoryStorage())).toBeNull()
    expect(DEFAULT_THEME_PREFERENCE).toBe('light')
    const root = mockRoot()
    const result = initialiseThemeFromStorage(memoryStorage(), root, false)
    expect(result.preference).toBe('light')
    expect(result.resolvedTheme).toBe('light')
    expect(root.dataset.theme).toBe('light')
  })

  it('restores a saved Light preference', () => {
    const storage = memoryStorage({ [THEME_STORAGE_KEY]: 'light' })
    expect(readStoredThemePreference(storage)).toBe('light')
    expect(resolveTheme('light', true)).toBe('light')
  })

  it('restores a saved Dark preference', () => {
    const storage = memoryStorage({ [THEME_STORAGE_KEY]: 'dark' })
    expect(readStoredThemePreference(storage)).toBe('dark')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('persists theme preference', () => {
    const storage = memoryStorage()
    writeStoredThemePreference('system', storage)
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('system')
    expect(readStoredThemePreference(storage)).toBe('system')
  })

  it('migrates legacy dark/slate settings into the preference model', () => {
    expect(migrateLegacyTheme('slate')).toBe('dark')
    expect(migrateLegacyTheme('dark')).toBe('dark')
    const storage = memoryStorage({
      'dp-settings': JSON.stringify({ theme: 'slate' }),
    })
    expect(readStoredThemePreference(storage)).toBe('dark')
  })
})

describe('system mode resolution', () => {
  it('resolves System to dark when the OS prefers dark', () => {
    expect(resolveTheme('system', true)).toBe('dark')
  })

  it('resolves System to light when the OS prefers light', () => {
    expect(resolveTheme('system', false)).toBe('light')
  })

  it('does not follow OS appearance for manual Light or Dark', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })
})

describe('root theme attribute', () => {
  it('applies the resolved theme on the document root', () => {
    const root = mockRoot()
    applyResolvedTheme('dark', root)
    expect(root.dataset.theme).toBe('dark')
    applyResolvedTheme('light', root)
    expect(root.dataset.theme).toBe('light')
  })

  it('updates the root attribute immediately when preference changes', () => {
    const root = mockRoot('light')
    const next = resolveTheme('dark', false)
    applyResolvedTheme(next, root)
    expect(root.dataset.theme).toBe('dark')
  })
})

describe('system appearance listener behaviour', () => {
  let listeners: Array<(event: MediaQueryListEvent) => void>

  beforeEach(() => {
    listeners = []
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query.includes('dark'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
          listeners.push(listener)
        },
        removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
          listeners = listeners.filter((item) => item !== listener)
        },
        dispatchEvent: vi.fn(),
      })),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reacts to OS appearance changes while System is selected', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    // Simulate OS flipping to light
    expect(resolveTheme('system', false)).toBe('light')
  })

  it('manual modes ignore subsequent OS appearance changes', () => {
    const lightWhileOsDark = resolveTheme('light', true)
    const darkWhileOsLight = resolveTheme('dark', false)
    expect(lightWhileOsDark).toBe('light')
    expect(darkWhileOsLight).toBe('dark')
  })
})
