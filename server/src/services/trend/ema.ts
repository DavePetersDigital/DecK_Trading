// Pure EMA maths for the Trend Engine (no service imports → unit testable).
// Ported from the client indicator so trend can be computed server-side for
// every monitored instrument, not just XAUUSD.

export type TrendDirection = 'bullish' | 'bearish'

/**
 * Standard EMA over chronological close prices.
 * Seed = SMA of the first `period` closes, then
 * EMA = close × k + previousEMA × (1 − k) where k = 2 / (period + 1).
 */
export function calculateEma(closes: number[], period: number): number | null {
  if (!Number.isInteger(period) || period < 1) return null
  if (closes.length < period) return null
  if (closes.some((close) => !Number.isFinite(close))) return null

  const multiplier = 2 / (period + 1)
  let ema = 0
  for (let index = 0; index < period; index += 1) ema += closes[index]!
  ema /= period
  for (let index = period; index < closes.length; index += 1) {
    ema = closes[index]! * multiplier + ema * (1 - multiplier)
  }
  return ema
}

/** Trend from the reference price vs EMA. Equal values yield no direction. */
export function classifyTrend(price: number | null, ema: number | null): TrendDirection | null {
  if (price == null || ema == null) return null
  if (!Number.isFinite(price) || !Number.isFinite(ema)) return null
  if (price > ema) return 'bullish'
  if (price < ema) return 'bearish'
  return null
}
