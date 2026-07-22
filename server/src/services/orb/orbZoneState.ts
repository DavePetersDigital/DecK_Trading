// ORB zone state machine driven by completed candle closes.
// Equality convention matches existing breakout detection:
//   close > orbHigh  → broken_above
//   close < orbLow   → broken_below
//   otherwise        → inside (includes touching the boundaries)

import type { OhlcCandle } from '../openingRange/openingRangeRules.js'
import type { MarketEventType, MarketEventTimeframe } from './marketEvent.js'

export type OrbZone = 'inside' | 'broken_above' | 'broken_below'

export interface OrbZoneSnapshot {
  /** Current zone after the last processed completed candle. */
  zone: OrbZone
  /**
   * Compatibility mirror of the current zone for existing scanner consumers:
   * high when broken_above, low when broken_below, null when inside.
   */
  direction: 'high' | 'low' | null
  /** True once any breakout has occurred on this timeframe (even if later returned). */
  hadBreakout: boolean
  candleTime: string | null
  confirmedAt: string | null
  /** Candle close time of the last processed completed candle (dedupe cursor). */
  lastProcessedCandleCloseUtc: string | null
}

export interface OrbZoneTransition {
  from: OrbZone
  to: OrbZone
  eventType: MarketEventType
  timeframe: MarketEventTimeframe
  candleOpenTime: string
  candleCloseTime: string
  closePrice: number
}

export function emptyOrbZoneSnapshot(): OrbZoneSnapshot {
  return {
    zone: 'inside',
    direction: null,
    hadBreakout: false,
    candleTime: null,
    confirmedAt: null,
    lastProcessedCandleCloseUtc: null,
  }
}

export function zoneFromClose(closePrice: number, orbHigh: number, orbLow: number): OrbZone {
  if (closePrice > orbHigh) return 'broken_above'
  if (closePrice < orbLow) return 'broken_below'
  return 'inside'
}

export function directionFromZone(zone: OrbZone): 'high' | 'low' | null {
  if (zone === 'broken_above') return 'high'
  if (zone === 'broken_below') return 'low'
  return null
}

export function eventTypeForTransition(from: OrbZone, to: OrbZone): MarketEventType | null {
  if (to === 'broken_above' && from !== 'broken_above') return 'orb_high_broken'
  if (to === 'broken_below' && from !== 'broken_below') return 'orb_low_broken'
  if (to === 'inside' && (from === 'broken_above' || from === 'broken_below')) return 'returned_to_orb'
  return null
}

/**
 * Walk completed candles in chronological order and emit zone transitions.
 * Does not re-process candles whose close time is at or before the snapshot cursor.
 * Live (still-forming) candles are ignored — re-entry requires a completed close.
 */
export function advanceOrbZoneFromCandles(
  previous: OrbZoneSnapshot,
  candles: OhlcCandle[],
  orbHigh: number,
  orbLow: number,
  afterMs: number,
  candleDurationMs: number,
  timeframe: MarketEventTimeframe,
  now: Date,
): { snapshot: OrbZoneSnapshot; transitions: OrbZoneTransition[] } {
  const sorted = [...candles].sort((a, b) => Date.parse(a.time) - Date.parse(b.time))
  let zone = previous.zone
  let hadBreakout = previous.hadBreakout
  let candleTime = previous.candleTime
  let confirmedAt = previous.confirmedAt
  let lastProcessed = previous.lastProcessedCandleCloseUtc
  const lastProcessedMs = lastProcessed ? Date.parse(lastProcessed) : Number.NEGATIVE_INFINITY
  const transitions: OrbZoneTransition[] = []
  const nowMs = now.getTime()

  for (const candle of sorted) {
    const start = Date.parse(candle.time)
    if (!Number.isFinite(start) || start < afterMs) continue
    const completeAt = start + candleDurationMs
    if (completeAt > nowMs) continue // still forming — never event on live price alone
    if (!Number.isFinite(candle.close)) continue
    if (completeAt <= lastProcessedMs) continue

    const nextZone = zoneFromClose(candle.close, orbHigh, orbLow)
    const eventType = eventTypeForTransition(zone, nextZone)
    const closeIso = new Date(completeAt).toISOString()

    if (eventType) {
      transitions.push({
        from: zone,
        to: nextZone,
        eventType,
        timeframe,
        candleOpenTime: candle.time,
        candleCloseTime: closeIso,
        closePrice: candle.close,
      })
      candleTime = candle.time
      confirmedAt = closeIso
      if (nextZone === 'broken_above' || nextZone === 'broken_below') hadBreakout = true
    }

    zone = nextZone
    lastProcessed = closeIso
  }

  return {
    snapshot: {
      zone,
      direction: directionFromZone(zone),
      hadBreakout,
      candleTime,
      confirmedAt,
      lastProcessedCandleCloseUtc: lastProcessed,
    },
    transitions,
  }
}

/** Migrate legacy latch-only snapshots into the zone model. */
export function normalizeZoneSnapshot(
  raw: Partial<OrbZoneSnapshot> & { direction?: 'high' | 'low' | null } | null | undefined,
): OrbZoneSnapshot {
  if (!raw) return emptyOrbZoneSnapshot()
  const direction = raw.direction ?? null
  const zone: OrbZone =
    raw.zone ??
    (direction === 'high' ? 'broken_above' : direction === 'low' ? 'broken_below' : 'inside')
  return {
    zone,
    direction: directionFromZone(zone),
    hadBreakout: raw.hadBreakout ?? direction != null,
    candleTime: raw.candleTime ?? null,
    confirmedAt: raw.confirmedAt ?? null,
    lastProcessedCandleCloseUtc: raw.lastProcessedCandleCloseUtc ?? raw.confirmedAt ?? null,
  }
}
