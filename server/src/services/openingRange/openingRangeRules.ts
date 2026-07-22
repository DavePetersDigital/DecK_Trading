// Pure helpers for turning completed M15 candles into an Opening Range.
// No service imports so it can be unit tested in isolation.

import { ORB_DURATION_MS } from '../openingProfile/openingProfileRules.js'

export type OpeningDirection = 'bullish' | 'bearish' | 'doji'

/** Minimal candle shape (matches CTraderCandle). `time` is the bar START (UTC ISO). */
export interface OhlcCandle {
  time: string
  open: number
  high: number
  low: number
  close: number
}

export interface OpeningRange {
  open: number
  high: number
  low: number
  close: number
  range: number
  direction: OpeningDirection
}

export function directionOf(open: number, close: number): OpeningDirection {
  if (close > open) return 'bullish'
  if (close < open) return 'bearish'
  return 'doji'
}

/** Find the candle whose start equals the opening instant (exact minute match). */
export function findOpeningCandle(candles: OhlcCandle[], openingInstant: Date): OhlcCandle | null {
  const target = openingInstant.getTime()
  for (const candle of candles) {
    const start = Date.parse(candle.time)
    if (Number.isFinite(start) && start === target) return candle
  }
  return null
}

/** A candle is complete only once its full period has elapsed. */
export function isCandleComplete(candle: OhlcCandle, now: Date, durationMs: number = ORB_DURATION_MS): boolean {
  const start = Date.parse(candle.time)
  if (!Number.isFinite(start)) return false
  return start + durationMs <= now.getTime()
}

/** Build an Opening Range from a single completed candle, or null if invalid. */
export function buildOpeningRange(candle: OhlcCandle): OpeningRange | null {
  const { open, high, low, close } = candle
  if (![open, high, low, close].every((value) => Number.isFinite(value))) return null
  if (high < low) return null
  return {
    open,
    high,
    low,
    close,
    range: high - low,
    direction: directionOf(open, close),
  }
}

/**
 * Extract historical Opening Ranges (as `high - low`) for the supplied opening
 * instants, from most-recent to oldest. Only candles with a positive range are
 * kept, mirroring the Gold EA's `h > l` guard. Stops once `limit` are found.
 */
export function collectHistoricalRanges(
  candles: OhlcCandle[],
  openingInstants: Date[],
  limit: number,
): number[] {
  const byStart = new Map<number, OhlcCandle>()
  for (const candle of candles) {
    const start = Date.parse(candle.time)
    if (Number.isFinite(start)) byStart.set(start, candle)
  }
  const ranges: number[] = []
  for (const instant of openingInstants) {
    if (ranges.length >= limit) break
    const candle = byStart.get(instant.getTime())
    if (!candle) continue
    if (!(candle.high > candle.low)) continue
    ranges.push(candle.high - candle.low)
  }
  return ranges
}
