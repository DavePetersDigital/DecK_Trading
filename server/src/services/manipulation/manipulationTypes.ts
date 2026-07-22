// Shared types for the pluggable manipulation engine. Each Opening Profile
// selects which algorithm to use; every algorithm returns this shape.

import type { ProfileManipulationMode } from '../openingProfile/openingProfileRules.js'

export type ManipulationClassification =
  | 'NORMAL'
  | 'ELEVATED'
  | 'LARGE'
  | 'EXTREME'
  | 'INSUFFICIENT_HISTORY'
  | 'PENDING_IMPLEMENTATION'

export interface ManipulationInput {
  /** Today's Opening Range size (high - low). */
  currentRange: number
  /** Prior Opening Range sizes for the same Opening Profile, newest-first. */
  historicalRanges: number[]
  /**
   * Completed Daily ATR used by the normal (non-Gold) algorithm.
   * Omit / null when ATR could not be calculated.
   */
  dailyAtr?: number | null
  /** True-range / Daily sample count associated with dailyAtr (or available history). */
  atrSampleCount?: number
}

export interface ManipulationResult {
  mode: ProfileManipulationMode
  /** true = manipulation candle; false = not; null = undetermined. */
  manipulation: boolean | null
  classification: ManipulationClassification
  /** Percentile rank of the current range vs history (0-100), or null. */
  rank: number | null
  sampleCount: number
  message: string
}

export interface ManipulationAlgorithm {
  readonly mode: ProfileManipulationMode
  evaluate(input: ManipulationInput): ManipulationResult
}
