// "Normal" manipulation algorithm — Opening Range as a % of Daily ATR(14).
// Used for every non-Gold instrument (manipulationMode: "normal").

import type { ManipulationAlgorithm, ManipulationInput, ManipulationResult } from './manipulationTypes.js'

/** Wilder ATR period over completed Daily candles. */
export const NORMAL_ATR_PERIOD = 14

/** atrPercentage thresholds (inclusive lower bounds). */
export const NORMAL_NO_THRESHOLD = 20
export const NORMAL_LARGE_THRESHOLD = 50
export const NORMAL_EXTREME_THRESHOLD = 70

export type NormalAtrBand = 'no' | 'normal' | 'large' | 'extreme'

/**
 * Classify opening-range / Daily ATR percentage.
 * Boundaries: 20 → Normal, 50 → Large, 70 → Extreme.
 */
export function classifyAtrPercentage(atrPercentage: number): NormalAtrBand {
  if (atrPercentage < NORMAL_NO_THRESHOLD) return 'no'
  if (atrPercentage < NORMAL_LARGE_THRESHOLD) return 'normal'
  if (atrPercentage < NORMAL_EXTREME_THRESHOLD) return 'large'
  return 'extreme'
}

function invalidResult(message: string, sampleCount = 0): ManipulationResult {
  return {
    mode: 'normal',
    manipulation: null,
    classification: 'INSUFFICIENT_HISTORY',
    rank: null,
    sampleCount,
    message,
  }
}

/**
 * ATR-based manipulation for non-Gold instruments.
 *
 * atrPercentage = (currentRange / dailyAtr) * 100
 *
 * Frontend mapping (unchanged):
 * - manipulation false → "No"
 * - manipulation true + NORMAL → "Normal"
 * - LARGE → "Large"
 * - EXTREME → "Extreme"
 *
 * "No" uses classification NORMAL + manipulation false (same convention as Gold
 * below its elevated percentile), so no frontend mapping change is required.
 */
export function evaluateNormal(input: ManipulationInput): ManipulationResult {
  const sampleCount = input.atrSampleCount ?? 0
  const range = input.currentRange
  const dailyAtr = input.dailyAtr

  if (!Number.isFinite(range) || range < 0) {
    return invalidResult('Invalid opening candle range', sampleCount)
  }
  if (dailyAtr == null || !Number.isFinite(dailyAtr)) {
    return invalidResult(
      sampleCount > 0 && sampleCount < NORMAL_ATR_PERIOD
        ? `Insufficient Daily history for ATR(${NORMAL_ATR_PERIOD}): ${sampleCount} true-range samples`
        : 'Daily ATR missing',
      sampleCount,
    )
  }
  if (dailyAtr <= 0) {
    return invalidResult('Daily ATR is zero or negative', sampleCount)
  }

  const atrPercentage = (range / dailyAtr) * 100
  if (!Number.isFinite(atrPercentage)) {
    return invalidResult('ATR percentage is non-finite', sampleCount)
  }

  const band = classifyAtrPercentage(atrPercentage)

  if (band === 'no') {
    return {
      mode: 'normal',
      manipulation: false,
      classification: 'NORMAL',
      rank: atrPercentage,
      sampleCount,
      message: `No (${atrPercentage.toFixed(2)}% of Daily ATR, n=${sampleCount})`,
    }
  }

  if (band === 'normal') {
    return {
      mode: 'normal',
      manipulation: true,
      classification: 'NORMAL',
      rank: atrPercentage,
      sampleCount,
      message: `Normal (${atrPercentage.toFixed(2)}% of Daily ATR, n=${sampleCount})`,
    }
  }

  if (band === 'large') {
    return {
      mode: 'normal',
      manipulation: true,
      classification: 'LARGE',
      rank: atrPercentage,
      sampleCount,
      message: `Large (${atrPercentage.toFixed(2)}% of Daily ATR, n=${sampleCount})`,
    }
  }

  return {
    mode: 'normal',
    manipulation: true,
    classification: 'EXTREME',
    rank: atrPercentage,
    sampleCount,
    message: `Extreme (${atrPercentage.toFixed(2)}% of Daily ATR, n=${sampleCount})`,
  }
}

export const normalAlgorithm: ManipulationAlgorithm = {
  mode: 'normal',
  evaluate: evaluateNormal,
}
