export interface AtrCandle {
  high: number
  low: number
  close: number
  time?: string
}

export interface WilderAtrResult {
  value: number
  period: number
  candleTime: string | null
  trueRangeCount: number
}

/** TR = max(high − low, |high − previousClose|, |low − previousClose|) */
export function calculateTrueRange(
  high: number,
  low: number,
  previousClose: number,
): number {
  return Math.max(
    high - low,
    Math.abs(high - previousClose),
    Math.abs(low - previousClose),
  )
}

/**
 * Wilder ATR(period) over chronological OHLC candles.
 * Requires at least period + 1 candles (seed previous close + period true ranges).
 * Intermediate values are not rounded.
 */
export function calculateWilderAtr(
  candles: AtrCandle[],
  period = 14,
): WilderAtrResult | null {
  if (!Number.isInteger(period) || period < 1) return null
  if (candles.length < period + 1) return null

  const trueRanges: number[] = []
  for (let index = 1; index < candles.length; index += 1) {
    const candle = candles[index]
    const previous = candles[index - 1]
    if (
      !Number.isFinite(candle.high)
      || !Number.isFinite(candle.low)
      || !Number.isFinite(previous.close)
    ) {
      return null
    }
    trueRanges.push(calculateTrueRange(candle.high, candle.low, previous.close))
  }

  if (trueRanges.length < period) return null

  let atr = 0
  for (let index = 0; index < period; index += 1) {
    atr += trueRanges[index]
  }
  atr /= period

  for (let index = period; index < trueRanges.length; index += 1) {
    atr = ((atr * (period - 1)) + trueRanges[index]) / period
  }

  const last = candles[candles.length - 1]
  return {
    value: atr,
    period,
    candleTime: typeof last.time === 'string' ? last.time : null,
    trueRangeCount: trueRanges.length,
  }
}
