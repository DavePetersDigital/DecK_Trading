// Pure model + validation + timezone maths for Opening Profiles.
// An Opening Profile defines WHEN an Opening Range begins for an instrument.
// This module has no runtime/service imports so it can be unit tested in
// isolation and reused by the store, the engine and the API layer.

export const ORB_TIMEFRAME = 'M15' as const
export const ORB_DURATION_MS = 15 * 60 * 1000

export type ProfileManipulationMode = 'normal' | 'gold_specific'
export const PROFILE_MANIPULATION_MODES: readonly ProfileManipulationMode[] = ['normal', 'gold_specific']

// The two ORB strategies differ ONLY in when they alert:
//  - all_breakouts    (Strategy B): alert on every ORB breakout.
//  - manipulation_only (Strategy A): alert only when the opening candle is a
//    manipulation candle. Manipulation is still computed either way.
export type AlertMode = 'all_breakouts' | 'manipulation_only'
export const ALERT_MODES: readonly AlertMode[] = ['all_breakouts', 'manipulation_only']

// Timeframes usable by the Trend Engine (higher-timeframe trend context).
export type TrendTimeframe = 'D1' | 'H4' | 'H1'
export const TREND_TIMEFRAMES: readonly TrendTimeframe[] = ['D1', 'H4', 'H1']
export const DEFAULT_TREND_EMA_PERIOD = 200
export const DEFAULT_TREND_TIMEFRAME: TrendTimeframe = 'D1'
/** Default trading window: 2 hours from Opening Profile open. */
export const DEFAULT_TRADING_WINDOW_MINUTES = 120
/**
 * When true, trader-facing alerts continue after the trading window expires.
 * Default true preserves prior always-alert behaviour for existing profiles.
 */
export const DEFAULT_ALLOW_TRADES_AFTER_WINDOW = true

export interface OpeningProfile {
  id: string
  displayName: string
  /** IANA timezone, e.g. "Asia/Tokyo". Never hardcode DST offsets. */
  timezone: string
  /** Local wall-clock opening time in the profile timezone, "HH:MM" (24h). */
  openingTime: string
  /** Local wall-clock market-session close in the profile timezone, "HH:MM" (24h). */
  closingTime: string
  orbTimeframe: typeof ORB_TIMEFRAME
  /**
   * @deprecated The manipulation algorithm is selected per instrument
   * (MonitoredInstrument.manipulationMode), not per profile. Retained only for
   * backward compatibility with previously persisted profiles.
   */
  manipulationMode: ProfileManipulationMode
  /** Which ORB strategy this profile runs (alert gating). */
  alertMode: AlertMode
  /** Trend Engine settings for this strategy. */
  trendEmaPeriod: number
  trendTimeframe: TrendTimeframe
  /** Minutes from open during which trader-facing alerts are preferred. */
  tradingWindowMinutes: number
  /** When false, suppress new trader-facing alerts after the trading window. */
  allowTradesAfterWindow: boolean
  createdAt: string
  updatedAt: string
}

export interface OpeningProfileInput {
  id?: unknown
  displayName?: unknown
  timezone?: unknown
  openingTime?: unknown
  closingTime?: unknown
  orbTimeframe?: unknown
  manipulationMode?: unknown
  alertMode?: unknown
  trendEmaPeriod?: unknown
  trendTimeframe?: unknown
  tradingWindowMinutes?: unknown
  allowTradesAfterWindow?: unknown
}

export interface OpeningProfilePatch {
  displayName?: unknown
  timezone?: unknown
  openingTime?: unknown
  closingTime?: unknown
  orbTimeframe?: unknown
  manipulationMode?: unknown
  alertMode?: unknown
  trendEmaPeriod?: unknown
  trendTimeframe?: unknown
  tradingWindowMinutes?: unknown
  allowTradesAfterWindow?: unknown
}

export class OpeningProfileValidationError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message)
    this.name = 'OpeningProfileValidationError'
  }
}

// ---------------------------------------------------------------------------
// Timezone maths (DST-safe via Intl, no hardcoded transition dates)
// ---------------------------------------------------------------------------

/**
 * Offset in ms between wall-clock time in `timeZone` and UTC for a given
 * instant, i.e. (localWallClock - utc). Computed with Intl so DST is handled
 * by the platform's IANA database rather than hardcoded rules.
 */
export function getTimeZoneOffsetMs(timeZone: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const map: Record<string, number> = {}
  for (const part of dtf.formatToParts(date)) {
    if (part.type !== 'literal') map[part.type] = Number(part.value)
  }
  let hour = map.hour ?? 0
  if (hour === 24) hour = 0
  const asUtc = Date.UTC(map.year!, (map.month ?? 1) - 1, map.day ?? 1, hour, map.minute ?? 0, map.second ?? 0)
  const actual = Math.floor(date.getTime() / 1000) * 1000
  return asUtc - actual
}

/** True when the timezone string is a valid IANA zone understood by the runtime. */
export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone || typeof timeZone !== 'string') return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}

/**
 * Convert a wall-clock date/time in `timeZone` to the corresponding UTC Date.
 * Uses a two-pass offset resolution so opening times land correctly even on
 * DST-transition days.
 */
export function zonedWallTimeToUtc(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0)
  const firstOffset = getTimeZoneOffsetMs(timeZone, new Date(utcGuess))
  let ts = utcGuess - firstOffset
  const secondOffset = getTimeZoneOffsetMs(timeZone, new Date(ts))
  if (secondOffset !== firstOffset) {
    ts = utcGuess - secondOffset
  }
  return new Date(ts)
}

/** The calendar date ("YYYY-MM-DD") in `timeZone` for a given instant. */
export function tradingDateForInstant(timeZone: string, date: Date): string {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const map: Record<string, string> = {}
  for (const part of dtf.formatToParts(date)) {
    if (part.type !== 'literal') map[part.type] = part.value
  }
  return `${map.year}-${map.month}-${map.day}`
}

const TRADING_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

/** UTC instant at which the Opening Range candle begins for a trading date. */
export function computeOpeningInstantUtc(profile: OpeningProfile, tradingDate: string): Date {
  const match = TRADING_DATE_PATTERN.exec(tradingDate)
  if (!match) throw new OpeningProfileValidationError(`Invalid tradingDate: ${tradingDate}`)
  const [, y, m, d] = match
  const { hour, minute } = parseOpeningTime(profile.openingTime)
  return zonedWallTimeToUtc(profile.timezone, Number(y), Number(m), Number(d), hour, minute)
}

/** UTC instant at which the first Opening Range candle completes. */
export function computeOpeningCandleCloseUtc(profile: OpeningProfile, tradingDate: string): Date {
  return new Date(computeOpeningInstantUtc(profile, tradingDate).getTime() + ORB_DURATION_MS)
}

/** UTC instant at which the market session closes for this trading date. */
export function computeClosingInstantUtc(profile: OpeningProfile, tradingDate: string): Date {
  const match = TRADING_DATE_PATTERN.exec(tradingDate)
  if (!match) throw new OpeningProfileValidationError(`Invalid tradingDate: ${tradingDate}`)
  const [, y, m, d] = match
  const { hour, minute } = parseOpeningTime(profile.closingTime)
  const open = computeOpeningInstantUtc(profile, tradingDate)
  let close = zonedWallTimeToUtc(profile.timezone, Number(y), Number(m), Number(d), hour, minute)
  // Overnight sessions (close earlier on the clock than open) roll to the next calendar day.
  if (close.getTime() <= open.getTime()) {
    const next = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d) + 1))
    const ny = next.getUTCFullYear()
    const nm = next.getUTCMonth() + 1
    const nd = next.getUTCDate()
    close = zonedWallTimeToUtc(profile.timezone, ny, nm, nd, hour, minute)
  }
  return close
}

/** UTC instant when the configurable trading window ends. */
export function computeTradingWindowEndUtc(profile: OpeningProfile, tradingDate: string): Date {
  const open = computeOpeningInstantUtc(profile, tradingDate)
  return new Date(open.getTime() + profile.tradingWindowMinutes * 60_000)
}

/**
 * Whether a trader-facing dashboard / future Telegram alert is allowed at `now`.
 * Market data and breakout state continue regardless.
 */
export function isTraderAlertAllowed(profile: OpeningProfile, tradingDate: string, now: Date): boolean {
  const end = computeTradingWindowEndUtc(profile, tradingDate)
  if (now.getTime() <= end.getTime()) return true
  return profile.allowTradesAfterWindow
}

/**
 * The previous `count` trading dates before `tradingDate` (weekends skipped),
 * matching the Gold EA's day-by-day historical scan. Returned newest-first.
 */
export function previousTradingDates(tradingDate: string, count: number): string[] {
  const match = TRADING_DATE_PATTERN.exec(tradingDate)
  if (!match) throw new OpeningProfileValidationError(`Invalid tradingDate: ${tradingDate}`)
  const [, y, m, d] = match
  const results: string[] = []
  const cursor = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)))
  const maxAttempts = count * 4 + 20
  let attempts = 0
  while (results.length < count && attempts < maxAttempts) {
    attempts += 1
    cursor.setUTCDate(cursor.getUTCDate() - 1)
    const weekday = cursor.getUTCDay()
    if (weekday === 0 || weekday === 6) continue
    results.push(formatUtcDate(cursor))
  }
  return results
}

function formatUtcDate(date: Date): string {
  const y = date.getUTCFullYear().toString().padStart(4, '0')
  const m = (date.getUTCMonth() + 1).toString().padStart(2, '0')
  const d = date.getUTCDate().toString().padStart(2, '0')
  return `${y}-${m}-${d}`
}

// ---------------------------------------------------------------------------
// Validation / normalisation
// ---------------------------------------------------------------------------

const OPENING_TIME_PATTERN = /^([01]?\d|2[0-3]):([0-5]\d)$/

export function parseOpeningTime(raw: unknown): { hour: number; minute: number } {
  if (typeof raw !== 'string' || !OPENING_TIME_PATTERN.test(raw.trim())) {
    throw new OpeningProfileValidationError('openingTime must be a 24-hour "HH:MM" string.')
  }
  const [hh, mm] = raw.trim().split(':')
  return { hour: Number(hh), minute: Number(mm) }
}

function normalizeOpeningTime(raw: unknown): string {
  const { hour, minute } = parseOpeningTime(raw)
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
}

function normalizeTimezone(raw: unknown): string {
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (!isValidTimeZone(value)) {
    throw new OpeningProfileValidationError(`timezone must be a valid IANA timezone (received "${String(raw)}").`)
  }
  return value
}

function normalizeManipulationMode(raw: unknown, fallback: ProfileManipulationMode = 'gold_specific'): ProfileManipulationMode {
  if (raw === undefined || raw === null) return fallback
  if (raw === 'normal' || raw === 'gold_specific') return raw
  throw new OpeningProfileValidationError(
    `manipulationMode must be one of: ${PROFILE_MANIPULATION_MODES.join(', ')}.`,
  )
}

function assertOrbTimeframe(raw: unknown) {
  if (raw === undefined || raw === null) return
  if (raw !== ORB_TIMEFRAME) {
    throw new OpeningProfileValidationError(`orbTimeframe must remain ${ORB_TIMEFRAME}.`)
  }
}

function normalizeAlertMode(raw: unknown, fallback: AlertMode = 'all_breakouts'): AlertMode {
  if (raw === undefined || raw === null) return fallback
  if (raw === 'all_breakouts' || raw === 'manipulation_only') return raw
  throw new OpeningProfileValidationError(`alertMode must be one of: ${ALERT_MODES.join(', ')}.`)
}

function normalizeTrendTimeframe(raw: unknown, fallback: TrendTimeframe = DEFAULT_TREND_TIMEFRAME): TrendTimeframe {
  if (raw === undefined || raw === null) return fallback
  if (TREND_TIMEFRAMES.includes(raw as TrendTimeframe)) return raw as TrendTimeframe
  throw new OpeningProfileValidationError(`trendTimeframe must be one of: ${TREND_TIMEFRAMES.join(', ')}.`)
}

function normalizeTrendEmaPeriod(raw: unknown, fallback: number = DEFAULT_TREND_EMA_PERIOD): number {
  if (raw === undefined || raw === null) return fallback
  const value = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isInteger(value) || value < 1 || value > 1000) {
    throw new OpeningProfileValidationError('trendEmaPeriod must be an integer between 1 and 1000.')
  }
  return value
}

function normalizeClosingTime(raw: unknown, fallback = '17:00'): string {
  if (raw === undefined || raw === null || raw === '') return normalizeOpeningTime(fallback)
  return normalizeOpeningTime(raw)
}

function defaultClosingTimeForId(id: string): string {
  if (id === 'tokyo-fx') return '15:00'
  return '17:00'
}

function normalizeTradingWindowMinutes(raw: unknown, fallback = DEFAULT_TRADING_WINDOW_MINUTES): number {
  if (raw === undefined || raw === null) return fallback
  const value = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isInteger(value) || value < 1 || value > 24 * 60) {
    throw new OpeningProfileValidationError('tradingWindowMinutes must be an integer between 1 and 1440.')
  }
  return value
}

function normalizeAllowTradesAfterWindow(raw: unknown, fallback = DEFAULT_ALLOW_TRADES_AFTER_WINDOW): boolean {
  if (raw === undefined || raw === null) return fallback
  if (typeof raw === 'boolean') return raw
  throw new OpeningProfileValidationError('allowTradesAfterWindow must be a boolean.')
}

export function slugifyProfileId(raw: string): string {
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug
}

function normalizeProfileId(raw: unknown, displayName: string): string {
  const provided = typeof raw === 'string' && raw.trim() ? slugifyProfileId(raw) : ''
  const derived = provided || slugifyProfileId(displayName)
  if (!derived) {
    throw new OpeningProfileValidationError('Opening Profile id/displayName must contain alphanumeric characters.')
  }
  return derived
}

function normalizeDisplayName(raw: unknown): string {
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (!value) throw new OpeningProfileValidationError('displayName is required.')
  return value
}

export function buildOpeningProfile(input: OpeningProfileInput, now: string): OpeningProfile {
  const displayName = normalizeDisplayName(input.displayName)
  assertOrbTimeframe(input.orbTimeframe)
  const id = normalizeProfileId(input.id, displayName)
  return {
    id,
    displayName,
    timezone: normalizeTimezone(input.timezone),
    openingTime: normalizeOpeningTime(input.openingTime),
    closingTime: normalizeClosingTime(input.closingTime, defaultClosingTimeForId(id)),
    orbTimeframe: ORB_TIMEFRAME,
    manipulationMode: normalizeManipulationMode(input.manipulationMode),
    alertMode: normalizeAlertMode(input.alertMode),
    trendEmaPeriod: normalizeTrendEmaPeriod(input.trendEmaPeriod),
    trendTimeframe: normalizeTrendTimeframe(input.trendTimeframe),
    tradingWindowMinutes: normalizeTradingWindowMinutes(input.tradingWindowMinutes),
    allowTradesAfterWindow: normalizeAllowTradesAfterWindow(input.allowTradesAfterWindow),
    createdAt: now,
    updatedAt: now,
  }
}

export function applyOpeningProfilePatch(existing: OpeningProfile, patch: OpeningProfilePatch, now: string): OpeningProfile {
  assertOrbTimeframe(patch.orbTimeframe)
  return {
    ...existing,
    displayName: patch.displayName === undefined ? existing.displayName : normalizeDisplayName(patch.displayName),
    timezone: patch.timezone === undefined ? existing.timezone : normalizeTimezone(patch.timezone),
    openingTime: patch.openingTime === undefined ? existing.openingTime : normalizeOpeningTime(patch.openingTime),
    closingTime:
      patch.closingTime === undefined
        ? existing.closingTime
        : normalizeClosingTime(patch.closingTime, existing.closingTime),
    orbTimeframe: ORB_TIMEFRAME,
    manipulationMode:
      patch.manipulationMode === undefined
        ? existing.manipulationMode
        : normalizeManipulationMode(patch.manipulationMode, existing.manipulationMode),
    alertMode:
      patch.alertMode === undefined ? existing.alertMode : normalizeAlertMode(patch.alertMode, existing.alertMode),
    trendEmaPeriod:
      patch.trendEmaPeriod === undefined
        ? existing.trendEmaPeriod
        : normalizeTrendEmaPeriod(patch.trendEmaPeriod, existing.trendEmaPeriod),
    trendTimeframe:
      patch.trendTimeframe === undefined
        ? existing.trendTimeframe
        : normalizeTrendTimeframe(patch.trendTimeframe, existing.trendTimeframe),
    tradingWindowMinutes:
      patch.tradingWindowMinutes === undefined
        ? existing.tradingWindowMinutes
        : normalizeTradingWindowMinutes(patch.tradingWindowMinutes, existing.tradingWindowMinutes),
    allowTradesAfterWindow:
      patch.allowTradesAfterWindow === undefined
        ? existing.allowTradesAfterWindow
        : normalizeAllowTradesAfterWindow(patch.allowTradesAfterWindow, existing.allowTradesAfterWindow),
    updatedAt: now,
  }
}

export function normalizeStoredProfile(raw: unknown, now: string): OpeningProfile | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  try {
    const displayName = normalizeDisplayName(record.displayName)
    const id = normalizeProfileId(record.id, displayName)
    return {
      id,
      displayName,
      timezone: normalizeTimezone(record.timezone),
      openingTime: normalizeOpeningTime(record.openingTime),
      closingTime: normalizeClosingTime(record.closingTime, defaultClosingTimeForId(id)),
      orbTimeframe: ORB_TIMEFRAME,
      manipulationMode: normalizeManipulationMode(record.manipulationMode),
      alertMode: normalizeAlertMode(record.alertMode),
      trendEmaPeriod: normalizeTrendEmaPeriod(record.trendEmaPeriod),
      trendTimeframe: normalizeTrendTimeframe(record.trendTimeframe),
      tradingWindowMinutes: normalizeTradingWindowMinutes(record.tradingWindowMinutes),
      allowTradesAfterWindow: normalizeAllowTradesAfterWindow(record.allowTradesAfterWindow),
      createdAt: typeof record.createdAt === 'string' ? record.createdAt : now,
      updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : now,
    }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Default seeds
// ---------------------------------------------------------------------------

// The four reference Opening Profiles. They default to Strategy B
// (all_breakouts) and a Daily EMA(200) trend. manipulationMode here is legacy
// and unused by the engine (algorithm is chosen per instrument); it is kept
// only so previously persisted seeds normalise cleanly.
const seedDefaults = {
  orbTimeframe: ORB_TIMEFRAME,
  manipulationMode: 'gold_specific' as ProfileManipulationMode,
  alertMode: 'all_breakouts' as AlertMode,
  trendEmaPeriod: DEFAULT_TREND_EMA_PERIOD,
  trendTimeframe: DEFAULT_TREND_TIMEFRAME,
  tradingWindowMinutes: DEFAULT_TRADING_WINDOW_MINUTES,
  allowTradesAfterWindow: DEFAULT_ALLOW_TRADES_AFTER_WINDOW,
}
export const DEFAULT_OPENING_PROFILE_SEEDS: ReadonlyArray<Omit<OpeningProfile, 'createdAt' | 'updatedAt'>> = [
  { id: 'tokyo-fx', displayName: 'Tokyo FX', timezone: 'Asia/Tokyo', openingTime: '09:00', closingTime: '15:00', ...seedDefaults },
  { id: 'london-fx', displayName: 'London FX', timezone: 'Europe/London', openingTime: '08:00', closingTime: '17:00', ...seedDefaults },
  { id: 'new-york-fx', displayName: 'New York FX', timezone: 'America/New_York', openingTime: '09:00', closingTime: '17:00', ...seedDefaults },
  { id: 'new-york-equities', displayName: 'New York Equities', timezone: 'America/New_York', openingTime: '09:30', closingTime: '17:00', ...seedDefaults },
]

export function seedOpeningProfiles(now: string): OpeningProfile[] {
  return DEFAULT_OPENING_PROFILE_SEEDS.map((seed) => ({ ...seed, createdAt: now, updatedAt: now }))
}
