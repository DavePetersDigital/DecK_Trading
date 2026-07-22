import type { CTraderCandle } from './ctraderApi'

export const M5_DURATION_MS = 5 * 60 * 1000
/** cTrader D1 trendbar period in UTC milliseconds (start → end). */
export const D1_DURATION_MS = 24 * 60 * 60 * 1000
export const MARKET_STALE_AFTER_MS = 15 * 60 * 1000
/** Completed D1 ATR is stale when the bar finished more than 72 hours ago. */
export const D1_ATR_STALE_AFTER_MS = 72 * 60 * 60 * 1000

/**
 * Select the newest completed candle from a chronological series.
 * A candle is completed when startTime + durationMs <= now (UTC).
 */
export function selectLatestCompletedCandle(
  candles: CTraderCandle[],
  durationMs: number,
  nowMs: number = Date.now(),
): CTraderCandle | null {
  let latest: CTraderCandle | null = null
  let latestStart = Number.NEGATIVE_INFINITY

  for (const candle of candles) {
    const startMs = Date.parse(candle.time)
    if (!Number.isFinite(startMs)) continue
    if (startMs + durationMs > nowMs) continue
    if (startMs >= latestStart) {
      latest = candle
      latestStart = startMs
    }
  }

  return latest
}

/**
 * Chronological completed candles only.
 * Excludes any bar whose period has not yet ended (forming candle).
 */
export function selectCompletedCandles(
  candles: CTraderCandle[],
  durationMs: number,
  nowMs: number = Date.now(),
): CTraderCandle[] {
  return candles
    .filter((candle) => {
      const startMs = Date.parse(candle.time)
      return Number.isFinite(startMs) && startMs + durationMs <= nowMs
    })
    .sort((left, right) => Date.parse(left.time) - Date.parse(right.time))
}

/** Newest completed M5 candle: startTime + 5 minutes <= now (UTC). */
export function selectLatestCompletedM5Candle(
  candles: CTraderCandle[],
  nowMs: number = Date.now(),
): CTraderCandle | null {
  return selectLatestCompletedCandle(candles, M5_DURATION_MS, nowMs)
}

/** Newest completed D1 candle: startTime + 24 hours <= now (UTC). */
export function selectLatestCompletedD1Candle(
  candles: CTraderCandle[],
  nowMs: number = Date.now(),
): CTraderCandle | null {
  return selectLatestCompletedCandle(candles, D1_DURATION_MS, nowMs)
}

/** True when the candle start is more than 15 minutes before now (UTC). */
export function isMarketCandleStale(
  candleTime: string,
  nowMs: number = Date.now(),
  maxAgeMs: number = MARKET_STALE_AFTER_MS,
): boolean {
  const startMs = Date.parse(candleTime)
  if (!Number.isFinite(startMs)) return true
  return nowMs - startMs > maxAgeMs
}

/** True when the completed D1 period ended more than 72 hours ago. */
export function isCompletedD1AtrStale(
  candleTime: string,
  nowMs: number = Date.now(),
  maxAgeAfterCloseMs: number = D1_ATR_STALE_AFTER_MS,
): boolean {
  const startMs = Date.parse(candleTime)
  if (!Number.isFinite(startMs)) return true
  const completedAt = startMs + D1_DURATION_MS
  return nowMs - completedAt > maxAgeAfterCloseMs
}
