// Pure candle-close ORB breakout detection.
// A breakout requires a completed candle whose CLOSE is outside the ORB.
// Wick penetration alone does not count.

import type { OhlcCandle } from '../openingRange/openingRangeRules.js'

export type CandleBreakoutDirection = 'high' | 'low'

export interface CandleBreakoutResult {
  direction: CandleBreakoutDirection | null
  /** ISO timestamp of the candle start that confirmed the breakout. */
  candleTime: string | null
  /** ISO timestamp when the candle completed (start + duration). */
  confirmedAt: string | null
}

const M5_MS = 5 * 60 * 1000
const M15_MS = 15 * 60 * 1000

export const CANDLE_DURATION_MS = { M5: M5_MS, M15: M15_MS } as const

/**
 * Find the first completed candle that closes outside the ORB after `afterMs`
 * (typically the opening candle close). Latches the earliest chronological
 * breakout; later opposite-direction closes do not replace it.
 */
export function detectCandleCloseBreakout(
  candles: OhlcCandle[],
  orbHigh: number,
  orbLow: number,
  afterMs: number,
  candleDurationMs: number,
  now: Date,
): CandleBreakoutResult {
  const sorted = [...candles].sort((a, b) => Date.parse(a.time) - Date.parse(b.time))
  for (const candle of sorted) {
    const start = Date.parse(candle.time)
    if (!Number.isFinite(start) || start < afterMs) continue
    const completeAt = start + candleDurationMs
    if (completeAt > now.getTime()) continue // still forming
    if (!Number.isFinite(candle.close)) continue

    if (candle.close > orbHigh) {
      return {
        direction: 'high',
        candleTime: candle.time,
        confirmedAt: new Date(completeAt).toISOString(),
      }
    }
    if (candle.close < orbLow) {
      return {
        direction: 'low',
        candleTime: candle.time,
        confirmedAt: new Date(completeAt).toISOString(),
      }
    }
  }
  return { direction: null, candleTime: null, confirmedAt: null }
}
