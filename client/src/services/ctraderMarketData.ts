import type { CTraderCandle } from './ctraderApi'

export const M5_DURATION_MS = 5 * 60 * 1000
export const MARKET_STALE_AFTER_MS = 15 * 60 * 1000

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

/** Newest completed M5 candle: startTime + 5 minutes <= now (UTC). */
export function selectLatestCompletedM5Candle(
  candles: CTraderCandle[],
  nowMs: number = Date.now(),
): CTraderCandle | null {
  return selectLatestCompletedCandle(candles, M5_DURATION_MS, nowMs)
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
