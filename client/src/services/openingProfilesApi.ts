// Thin client for the existing Opening Profile REST API (/api/opening-profiles).
// No backend changes: this simply mirrors the server's request/response shapes.

export type AlertMode = 'all_breakouts' | 'manipulation_only'
export type TrendTimeframe = 'D1' | 'H4' | 'H1'
export type ProfileManipulationMode = 'normal' | 'gold_specific'

export interface OpeningProfile {
  id: string
  displayName: string
  timezone: string
  openingTime: string
  closingTime: string
  orbTimeframe: 'M15'
  manipulationMode: ProfileManipulationMode
  alertMode: AlertMode
  trendEmaPeriod: number
  trendTimeframe: TrendTimeframe
  tradingWindowMinutes: number
  allowTradesAfterWindow: boolean
  createdAt: string
  updatedAt: string
}

export interface OpeningProfileInput {
  displayName: string
  timezone: string
  openingTime: string
  closingTime?: string
  alertMode?: AlertMode
  trendEmaPeriod?: number
  trendTimeframe?: TrendTimeframe
  tradingWindowMinutes?: number
  allowTradesAfterWindow?: boolean
}

export interface OpeningProfilePatch {
  displayName?: string
  timezone?: string
  openingTime?: string
  closingTime?: string
  alertMode?: AlertMode
  trendEmaPeriod?: number
  trendTimeframe?: TrendTimeframe
  tradingWindowMinutes?: number
  allowTradesAfterWindow?: boolean
}

export const ALERT_MODE_LABELS: Record<AlertMode, string> = {
  all_breakouts: 'All Breakouts',
  manipulation_only: 'Manipulation Only',
}

export const TREND_TIMEFRAME_LABELS: Record<TrendTimeframe, string> = {
  D1: 'Daily',
  H4: '4 Hour',
  H1: '1 Hour',
}

export const ALERT_MODE_ORDER: AlertMode[] = ['all_breakouts', 'manipulation_only']
export const TREND_TIMEFRAME_ORDER: TrendTimeframe[] = ['D1', 'H4', 'H1']

// A curated set of IANA zones covering the reference profiles plus common
// trading centres. The current value is always merged in by the editor so a
// custom zone stored on the server is never dropped from the dropdown.
export const COMMON_TIMEZONES: string[] = [
  'UTC',
  'Asia/Tokyo',
  'Asia/Hong_Kong',
  'Asia/Singapore',
  'Asia/Shanghai',
  'Asia/Dubai',
  'Australia/Sydney',
  'Europe/London',
  'Europe/Frankfurt',
  'Europe/Zurich',
  'America/New_York',
  'America/Chicago',
  'Pacific/Auckland',
]

interface ListResponse {
  success: boolean
  profiles?: OpeningProfile[]
  error?: string
}

interface SingleResponse {
  success: boolean
  profile?: OpeningProfile
  error?: string
}

async function parseJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T
  } catch {
    throw new Error(`Unexpected response from the server (${response.status}).`)
  }
}

export async function fetchOpeningProfiles(): Promise<OpeningProfile[]> {
  const response = await fetch('/api/opening-profiles')
  const payload = await parseJson<ListResponse>(response)
  if (!response.ok || !payload.success) {
    throw new Error(payload.error || `Failed to load Opening Profiles (${response.status}).`)
  }
  return payload.profiles ?? []
}

export async function createOpeningProfile(input: OpeningProfileInput): Promise<OpeningProfile> {
  const response = await fetch('/api/opening-profiles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const payload = await parseJson<SingleResponse>(response)
  if (!response.ok || !payload.success || !payload.profile) {
    throw new Error(payload.error || `Failed to create Opening Profile (${response.status}).`)
  }
  return payload.profile
}

export async function patchOpeningProfile(id: string, patch: OpeningProfilePatch): Promise<OpeningProfile> {
  const response = await fetch(`/api/opening-profiles/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  const payload = await parseJson<SingleResponse>(response)
  if (!response.ok || !payload.success || !payload.profile) {
    throw new Error(payload.error || `Failed to update Opening Profile (${response.status}).`)
  }
  return payload.profile
}

export async function deleteOpeningProfile(id: string): Promise<void> {
  const response = await fetch(`/api/opening-profiles/${encodeURIComponent(id)}`, { method: 'DELETE' })
  const payload = await parseJson<{ success: boolean; error?: string }>(response)
  if (!response.ok || !payload.success) {
    throw new Error(payload.error || `Failed to delete Opening Profile (${response.status}).`)
  }
}
