// Pure presentation helpers for the Market Scanner table.
// Countdown / highlight logic lives here so the dashboard stays a thin viewer
// of backend state + Opening Profile clock fields.

import type { CandleBreakoutSnapshot, MarketEvent, OrbManipulation, OrbMonitor } from '../services/orbApi'
import { calculateTradingSession } from '../services/sessionEngine'
import type { SessionDefinition, SessionConfiguration, SessionId } from '../types/session'

export type ClockLabel = 'Closed' | 'Open' | 'Closing Soon'
export type ClockTone = 'grey' | 'green' | 'red'

export interface ClockCell {
  label: ClockLabel
  detail: string
  tone: ClockTone
  isOpen: boolean
  isClosingSoon: boolean
}

export type ManipulationLabel = 'No' | 'Normal' | 'Large' | 'Extreme' | '—'
export type BreakoutLabel = 'No Breakout' | 'ORB High Broken' | 'ORB Low Broken' | 'Inside ORB'
export type RowHighlightMode = 'qualified' | 'any' | 'never'
export type RowTint = 'none' | 'bullish' | 'bearish' | 'neutral'

export interface ProfileClockInput {
  timezone: string
  openingTime: string
  closingTime: string
  tradingWindowMinutes: number
  allowTradesAfterWindow: boolean
}

const CLOSING_SOON_MINUTES = 30

const scannerSessionConfig: SessionConfiguration = {
  sessions: {
    tokyo: { id: 'tokyo', name: 'Tokyo', timeZone: 'Asia/Tokyo', open: { hour: 9, minute: 0 }, close: { hour: 15, minute: 0 } },
    london: { id: 'london', name: 'London', timeZone: 'Europe/London', open: { hour: 8, minute: 0 }, close: { hour: 17, minute: 0 } },
    newYork: { id: 'newYork', name: 'New York', timeZone: 'America/New_York', open: { hour: 9, minute: 30 }, close: { hour: 17, minute: 0 } },
  },
  openingSoonMinutes: 0,
  closingSoonMinutes: CLOSING_SOON_MINUTES,
  candleAlertSeconds: 60,
  brokerUtcOffsetMinutes: 0,
}

/** Compact HH:MM:SS for scanner countdowns. */
export function formatCountdownHms(totalSeconds: number): string {
  const value = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(value / 3600)
  const minutes = Math.floor((value % 3600) / 60)
  const seconds = value % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function parseHhMm(value: string): { hour: number; minute: number } {
  const [hh, mm] = value.split(':')
  return { hour: Number(hh) || 0, minute: Number(mm) || 0 }
}

function toSessionDefinition(input: ProfileClockInput): SessionDefinition {
  return {
    id: 'tokyo' as SessionId,
    name: 'Profile',
    timeZone: input.timezone,
    open: parseHhMm(input.openingTime),
    close: parseHhMm(input.closingTime),
  }
}

/** Market Status for an Opening Profile — reuses the existing session clock engine. */
export function marketStatusForProfile(input: ProfileClockInput, now: Date): ClockCell {
  const session = calculateTradingSession(now, toSessionDefinition(input), scannerSessionConfig)
  if (session.state === 'OPEN') {
    return {
      label: 'Open',
      detail: `Closes in ${formatCountdownHms(session.countdownToClose)}`,
      tone: 'green',
      isOpen: true,
      isClosingSoon: false,
    }
  }
  if (session.state === 'CLOSING_SOON') {
    return {
      label: 'Closing Soon',
      detail: `Closes in ${formatCountdownHms(session.countdownToClose)}`,
      tone: 'red',
      isOpen: true,
      isClosingSoon: true,
    }
  }
  return {
    label: 'Closed',
    detail: `Opens in ${formatCountdownHms(session.countdownToOpen)}`,
    tone: 'grey',
    isOpen: false,
    isClosingSoon: false,
  }
}

/**
 * Trading Window countdown. Prefer backend `tradingWindowEndUtc` when present
 * so it stays aligned with alert gating; otherwise derive from open + duration.
 */
export function tradingWindowStatus(
  openingInstantUtc: string,
  tradingWindowEndUtc: string | null | undefined,
  tradingWindowMinutes: number,
  allowTradesAfterWindow: boolean,
  now: Date,
): ClockCell {
  const openMs = Date.parse(openingInstantUtc)
  const endMs = tradingWindowEndUtc
    ? Date.parse(tradingWindowEndUtc)
    : openMs + tradingWindowMinutes * 60_000
  const nowMs = now.getTime()

  if (!Number.isFinite(openMs) || !Number.isFinite(endMs)) {
    return { label: 'Closed', detail: '—', tone: 'grey', isOpen: false, isClosingSoon: false }
  }

  if (nowMs < openMs) {
    const seconds = Math.max(0, Math.floor((openMs - nowMs) / 1000))
    return {
      label: 'Closed',
      detail: `Opens in ${formatCountdownHms(seconds)}`,
      tone: 'grey',
      isOpen: false,
      isClosingSoon: false,
    }
  }

  if (nowMs <= endMs) {
    const seconds = Math.max(0, Math.floor((endMs - nowMs) / 1000))
    const closingSoon = seconds <= CLOSING_SOON_MINUTES * 60
    return {
      label: closingSoon ? 'Closing Soon' : 'Open',
      detail: `Closes in ${formatCountdownHms(seconds)}`,
      tone: closingSoon ? 'red' : 'green',
      isOpen: true,
      isClosingSoon: closingSoon,
    }
  }

  const agoSeconds = Math.max(0, Math.floor((nowMs - endMs) / 1000))
  return {
    label: 'Closed',
    detail: allowTradesAfterWindow
      ? `Closed ${formatCountdownHms(agoSeconds)} ago · Extended monitoring on`
      : `Closed ${formatCountdownHms(agoSeconds)} ago`,
    tone: 'grey',
    isOpen: false,
    isClosingSoon: false,
  }
}

export function manipulationLabel(manipulation: OrbManipulation | null | undefined): ManipulationLabel {
  if (!manipulation || manipulation.manipulation == null) {
    if (manipulation?.classification === 'PENDING_IMPLEMENTATION') return '—'
    if (manipulation?.classification === 'INSUFFICIENT_HISTORY') return '—'
    return '—'
  }
  if (manipulation.manipulation === false) return 'No'
  switch (manipulation.classification) {
    case 'EXTREME':
      return 'Extreme'
    case 'LARGE':
      return 'Large'
    case 'ELEVATED':
    case 'NORMAL':
    default:
      return 'Normal'
  }
}

/** Current scanner cell label for an ORB zone snapshot. */
export function breakoutLabel(
  directionOrSnapshot: 'high' | 'low' | null | undefined | CandleBreakoutSnapshot,
): BreakoutLabel {
  if (directionOrSnapshot && typeof directionOrSnapshot === 'object') {
    const snapshot = directionOrSnapshot
    if (snapshot.direction === 'high' || snapshot.zone === 'broken_above') return 'ORB High Broken'
    if (snapshot.direction === 'low' || snapshot.zone === 'broken_below') return 'ORB Low Broken'
    if (snapshot.hadBreakout) return 'Inside ORB'
    return 'No Breakout'
  }
  if (directionOrSnapshot === 'high') return 'ORB High Broken'
  if (directionOrSnapshot === 'low') return 'ORB Low Broken'
  return 'No Breakout'
}

/**
 * Whole-row highlight.
 * Only active confirmed breakouts (current zone broken above/below) tint the row.
 * Returned-to-ORB / inside-after-breakout clears that timeframe's directional contribution.
 * Rule when M5 and M15 disagree: neutral attention tint.
 */
export function rowTintForMonitor(
  monitor: OrbMonitor,
  mode: RowHighlightMode,
  now: Date = new Date(),
): RowTint {
  if (mode === 'never') return 'none'

  const m5 = activeBreakoutDirection(monitor.m5Breakout)
  const m15 = activeBreakoutDirection(monitor.m15Breakout)
  if (!m5 && !m15) return 'none'

  // Suppress highlight for breakouts confirmed after the trading-window cutoff
  // when extended monitoring is off.
  const windowEnd = Date.parse(monitor.tradingWindowEndUtc ?? '')
  const allowAfter = monitor.allowTradesAfterWindow !== false
  const eligible = (confirmedAt: string | null | undefined) => {
    if (allowAfter || !Number.isFinite(windowEnd)) return true
    if (!confirmedAt) return true
    const at = Date.parse(confirmedAt)
    return Number.isFinite(at) ? at <= windowEnd : true
  }

  const m5Ok = m5 && eligible(monitor.m5Breakout?.confirmedAt)
  const m15Ok = m15 && eligible(monitor.m15Breakout?.confirmedAt)
  if (!m5Ok && !m15Ok) return 'none'

  if (mode === 'qualified') {
    const manip = manipulationLabel(monitor.manipulation)
    if (manip === 'No' || manip === '—') return 'none'
  }

  let direction: 'high' | 'low' | null = null
  if (m5Ok && m15Ok) {
    if (m5 === m15) direction = m5
    else return 'neutral' // disagreeing directions → neutral attention tint
  } else {
    direction = (m5Ok ? m5 : m15) as 'high' | 'low'
  }

  void now
  if (direction === 'high') return 'bullish'
  if (direction === 'low') return 'bearish'
  return 'none'
}

/** Direction only while the timeframe is currently outside the ORB. */
export function activeBreakoutDirection(
  snapshot: CandleBreakoutSnapshot | null | undefined,
): 'high' | 'low' | null {
  if (!snapshot) return null
  if (snapshot.zone === 'broken_above' || snapshot.direction === 'high') return 'high'
  if (snapshot.zone === 'broken_below' || snapshot.direction === 'low') return 'low'
  return null
}

export function isHighlighted(tint: RowTint): boolean {
  return tint !== 'none'
}

/**
 * True while the selected Opening Profile should still drive breakout cells
 * and row highlighting. Extended monitoring continues after the trading window
 * (and possibly the market session) when allowTradesAfterWindow is on.
 */
export function isProfileBeingMonitored(input: {
  marketOpen: boolean
  tradingWindowOpen: boolean
  extendedMonitoring: boolean
}): boolean {
  return input.marketOpen || input.tradingWindowOpen || input.extendedMonitoring
}

/** Display label for breakout columns; clears to — when monitoring has ended. */
export function displayedBreakoutLabel(
  beingMonitored: boolean,
  snapshot: CandleBreakoutSnapshot | 'high' | 'low' | null | undefined,
): BreakoutLabel | '—' {
  if (!beingMonitored) return '—'
  return breakoutLabel(snapshot)
}

export function formatLastAlert(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '—'
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return '—'
  const seconds = Math.max(0, Math.floor((now.getTime() - at) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return new Date(at).toISOString().slice(11, 19)
}

/** Most recent market event time for a monitor (profile + trading date). */
export function latestEventAtForMonitor(
  monitor: OrbMonitor,
  events: MarketEvent[],
): string | null {
  const match = events.find(
    (event) =>
      event.instrumentId === monitor.symbolId &&
      event.openingProfileId === monitor.profileId &&
      event.tradingDate === monitor.tradingDate,
  )
  return match?.occurredAt ?? null
}

export function marketEventManipulationLabel(
  category: MarketEvent['manipulationCategory'],
): ManipulationLabel {
  if (category === 'no') return 'No'
  if (category === 'normal') return 'Normal'
  if (category === 'large') return 'Large'
  if (category === 'extreme') return 'Extreme'
  return '—'
}

/** Rankable profile entry used to pick the single displayed Opening Profile. */
export interface RankableProfile {
  id: string
  openingInstantUtc: string
  closingInstantUtc?: string | null
  marketOpen: boolean
  tradingWindowOpen: boolean
  /** Trading window closed, but allowTradesAfterWindow keeps monitoring active. */
  extendedMonitoring: boolean
  hasBreakout: boolean
  /** Seconds until market opens; 0 when open. Used for “next due to open”. */
  secondsToOpen: number
}

/**
 * Select the single most relevant Opening Profile for an instrument.
 * Priority:
 * 1. Inside trading window
 * 2. Market session open
 * 3. Extended monitoring
 * 4. Active / recent breakout
 * 5. Next profile due to open
 * 6. Most recently closed
 * Ties → most recent session start (`openingInstantUtc`).
 */
export function selectRelevantProfile<T extends RankableProfile>(profiles: T[]): T | null {
  if (profiles.length === 0) return null
  if (profiles.length === 1) return profiles[0]!

  const byRecentOpen = (left: T, right: T) =>
    Date.parse(right.openingInstantUtc) - Date.parse(left.openingInstantUtc)

  const inWindow = profiles.filter((profile) => profile.tradingWindowOpen).sort(byRecentOpen)
  if (inWindow.length) return inWindow[0]!

  const marketOpen = profiles.filter((profile) => profile.marketOpen).sort(byRecentOpen)
  if (marketOpen.length) return marketOpen[0]!

  const extended = profiles.filter((profile) => profile.extendedMonitoring).sort(byRecentOpen)
  if (extended.length) return extended[0]!

  const breakouts = profiles.filter((profile) => profile.hasBreakout).sort(byRecentOpen)
  if (breakouts.length) return breakouts[0]!

  const upcoming = profiles
    .filter((profile) => !profile.marketOpen && profile.secondsToOpen > 0)
    .sort((left, right) => left.secondsToOpen - right.secondsToOpen || byRecentOpen(left, right))
  if (upcoming.length) return upcoming[0]!

  // Most recently closed: prefer largest closingInstant, else most recent open.
  return [...profiles].sort((left, right) => {
    const leftClose = Date.parse(left.closingInstantUtc ?? '')
    const rightClose = Date.parse(right.closingInstantUtc ?? '')
    if (Number.isFinite(leftClose) && Number.isFinite(rightClose) && leftClose !== rightClose) {
      return rightClose - leftClose
    }
    return byRecentOpen(left, right)
  })[0]!
}

export type ScannerFilter = 'all' | 'attention' | 'open_markets' | 'active_windows' | 'manipulation'

export interface InstrumentProfileView {
  monitor: OrbMonitor
  profileId: string
  profileName: string
  market: ClockCell
  window: ClockCell
  manip: ManipulationLabel
  m5: BreakoutLabel
  m15: BreakoutLabel
  tint: RowTint
  highlighted: boolean
  latestAlertAt: string | null
  rank: RankableProfile
}

export interface ScannerInstrument {
  symbolId: string
  symbolName: string
  displayName: string
  trend: 'Bullish' | 'Bearish' | '—'
  profiles: InstrumentProfileView[]
}

export function profileMatchesFilter(profile: InstrumentProfileView, filter: ScannerFilter): boolean {
  switch (filter) {
    case 'attention':
      return profile.highlighted
    case 'open_markets':
      return profile.market.isOpen
    case 'active_windows':
      return profile.window.isOpen
    case 'manipulation':
      return profile.manip !== 'No' && profile.manip !== '—'
    default:
      return true
  }
}

/**
 * Pick the profile to display for an instrument under the current filter.
 * Filter matchers first; among matches, apply selectRelevantProfile.
 */
export function selectDisplayedProfile(
  instrument: ScannerInstrument,
  filter: ScannerFilter,
): InstrumentProfileView | null {
  const candidates =
    filter === 'all' ? instrument.profiles : instrument.profiles.filter((profile) => profileMatchesFilter(profile, filter))
  if (candidates.length === 0) return null
  const selected = selectRelevantProfile(candidates.map((profile) => profile.rank))
  if (!selected) return candidates[0] ?? null
  return candidates.find((profile) => profile.rank.id === selected.id) ?? candidates[0] ?? null
}
