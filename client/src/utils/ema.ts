export type DailyBiasDirection = 'Bullish' | 'Bearish'

export interface EmaResult {
  value: number
  period: number
}

/**
 * Standard EMA over chronological close prices.
 * Initialisation: SMA of the first `period` closes, then
 * EMA = close × k + previousEMA × (1 − k) where k = 2 / (period + 1).
 */
export function calculateEma(closes: number[], period: number): EmaResult | null {
  if (!Number.isInteger(period) || period < 1) return null
  if (closes.length < period) return null
  if (closes.some((close) => !Number.isFinite(close))) return null

  const multiplier = 2 / (period + 1)
  let ema = 0
  for (let index = 0; index < period; index += 1) {
    ema += closes[index]
  }
  ema /= period

  for (let index = period; index < closes.length; index += 1) {
    ema = (closes[index] * multiplier) + (ema * (1 - multiplier))
  }

  return { value: ema, period }
}

/** Bias from live mid vs EMA200. Equal prices yield no bias. */
export function calculateBiasFromEma(
  liveMid: number | null,
  ema200: number | null,
): DailyBiasDirection | null {
  if (liveMid == null || ema200 == null) return null
  if (!Number.isFinite(liveMid) || !Number.isFinite(ema200)) return null
  if (liveMid > ema200) return 'Bullish'
  if (liveMid < ema200) return 'Bearish'
  return null
}
