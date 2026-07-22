// Gold-specific manipulation algorithm.
// Reproduces the historical percentile ranking from DP_Gold_ORB_v2.0.mq4:
// rank today's Opening Range against the previous ranges of the same Opening
// Profile, then classify the result.

import type {
  ManipulationAlgorithm,
  ManipulationClassification,
  ManipulationInput,
  ManipulationResult,
} from './manipulationTypes.js'

export const GOLD_HISTORICAL_SAMPLES = 20
export const GOLD_MINIMUM_SAMPLES = 10

// Percentile thresholds mirror the EA inputs.
export const GOLD_ELEVATED_PERCENTILE = 60
export const GOLD_LARGE_PERCENTILE = 80
export const GOLD_EXTREME_PERCENTILE = 95

export interface GoldRankResult {
  rank: number
  sampleCount: number
}

/**
 * Percentile rank = share of historical ranges that are <= the current range.
 * Only the most recent `GOLD_HISTORICAL_SAMPLES` positive samples are used.
 */
export function computeGoldRank(currentRange: number, historicalRanges: number[]): GoldRankResult {
  const samples = historicalRanges
    .filter((value) => Number.isFinite(value) && value > 0)
    .slice(0, GOLD_HISTORICAL_SAMPLES)
  const sampleCount = samples.length
  if (sampleCount === 0) return { rank: 0, sampleCount: 0 }
  const lessOrEqual = samples.filter((value) => value <= currentRange).length
  return { rank: (100 * lessOrEqual) / sampleCount, sampleCount }
}

export function classifyGoldRank(rank: number): 'NORMAL' | 'ELEVATED' | 'LARGE' | 'EXTREME' {
  if (rank >= GOLD_EXTREME_PERCENTILE) return 'EXTREME'
  if (rank >= GOLD_LARGE_PERCENTILE) return 'LARGE'
  if (rank >= GOLD_ELEVATED_PERCENTILE) return 'ELEVATED'
  return 'NORMAL'
}

export function evaluateGoldSpecific(input: ManipulationInput): ManipulationResult {
  const { rank, sampleCount } = computeGoldRank(input.currentRange, input.historicalRanges)

  if (sampleCount < GOLD_MINIMUM_SAMPLES) {
    return {
      mode: 'gold_specific',
      manipulation: null,
      classification: 'INSUFFICIENT_HISTORY',
      rank: null,
      sampleCount,
      message: `Insufficient history: ${sampleCount}/${GOLD_MINIMUM_SAMPLES} samples`,
    }
  }

  const classification: ManipulationClassification = classifyGoldRank(rank)
  const manipulation = classification !== 'NORMAL'
  return {
    mode: 'gold_specific',
    manipulation,
    classification,
    rank,
    sampleCount,
    message: `${classification} (rank ${Math.round(rank)}%, n=${sampleCount})`,
  }
}

export const goldSpecificAlgorithm: ManipulationAlgorithm = {
  mode: 'gold_specific',
  evaluate: evaluateGoldSpecific,
}
