// Trend Engine.
//
// Sole responsibility: determine the higher-timeframe trend (Bullish / Bearish)
// for an instrument. It consumes Market Data (historical candles) and exposes a
// simple, cached result the ORB engine / dashboard can read. It performs no ORB
// or manipulation logic.

import { logger } from '../../utils/logger.js'
import { getConfiguredCTraderHistory } from '../ctraderAccountService.js'
import { CTraderOAuthError } from '../ctraderService.js'
import {
  DEFAULT_TREND_EMA_PERIOD,
  DEFAULT_TREND_TIMEFRAME,
  type TrendTimeframe,
} from '../openingProfile/openingProfileRules.js'
import { calculateEma, classifyTrend, type TrendDirection } from './ema.js'

export interface TrendConfig {
  emaPeriod: number
  timeframe: TrendTimeframe
}

export const DEFAULT_TREND_CONFIG: TrendConfig = {
  emaPeriod: DEFAULT_TREND_EMA_PERIOD,
  timeframe: DEFAULT_TREND_TIMEFRAME,
}

export interface TrendSnapshot {
  symbolId: string
  timeframe: TrendTimeframe
  emaPeriod: number
  trend: TrendDirection | null
  ema: number | null
  price: number | null
  updatedAt: string
  stale: boolean
}

const CACHE_TTL_MS = 60 * 60 * 1000 // recompute at most hourly per symbol/config

interface CacheEntry {
  snapshot: TrendSnapshot
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()
const inFlight = new Set<string>()

function cacheKey(symbolId: string, config: TrendConfig): string {
  return `${symbolId}|${config.timeframe}|${config.emaPeriod}`
}

async function computeTrend(symbolId: string, config: TrendConfig): Promise<TrendSnapshot> {
  const count = Math.min(5000, config.emaPeriod + 60)
  const candles = await getConfiguredCTraderHistory({ symbolId, timeframe: config.timeframe, count })

  // Exclude the newest (potentially still-forming) candle; trend uses completed data.
  const completed = candles.length > 0 ? candles.slice(0, -1) : candles
  const closes = completed.map((candle) => candle.close)
  const price = closes.length > 0 ? closes[closes.length - 1]! : null
  const ema = calculateEma(closes, config.emaPeriod)

  return {
    symbolId,
    timeframe: config.timeframe,
    emaPeriod: config.emaPeriod,
    trend: classifyTrend(price, ema),
    ema,
    price,
    updatedAt: new Date().toISOString(),
    stale: false,
  }
}

/**
 * Cached trend for a symbol. Returns the last computed snapshot (marked stale)
 * if a refresh is due but cTrader is unavailable, or null if nothing is known
 * yet. Never throws.
 */
export async function getTrendForSymbol(
  symbolId: string,
  config: TrendConfig = DEFAULT_TREND_CONFIG,
): Promise<TrendSnapshot | null> {
  const key = cacheKey(symbolId, config)
  const now = Date.now()
  const cached = cache.get(key)
  if (cached && cached.expiresAt > now) return cached.snapshot
  if (inFlight.has(key)) return cached?.snapshot ?? null

  inFlight.add(key)
  try {
    const snapshot = await computeTrend(symbolId, config)
    cache.set(key, { snapshot, expiresAt: now + CACHE_TTL_MS })
    return snapshot
  } catch (error) {
    if (!(error instanceof CTraderOAuthError)) {
      logger.error(`Trend Engine: failed to compute trend for ${symbolId}.`, error)
    }
    if (cached) {
      const stale: TrendSnapshot = { ...cached.snapshot, stale: true }
      return stale
    }
    return null
  } finally {
    inFlight.delete(key)
  }
}

/** Test-only reset. */
export function __resetTrendCache(): void {
  cache.clear()
  inFlight.clear()
}
