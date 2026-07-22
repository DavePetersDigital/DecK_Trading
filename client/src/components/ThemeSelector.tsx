import { useTheme } from '../context/ThemeContext'
import type { ThemePreference } from '../theme/theme'

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

export function ThemeSelector() {
  const { preference, resolvedTheme, setThemePreference } = useTheme()
  const icon = resolvedTheme === 'dark' ? '☾' : '☀'

  return (
    <label className="theme-selector" title={`Theme: ${preference}`}>
      <span className="theme-selector-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="sr-only">Theme</span>
      <select
        aria-label="Theme"
        value={preference}
        onChange={(event) => setThemePreference(event.target.value as ThemePreference)}
      >
        {OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
