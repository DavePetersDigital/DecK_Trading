import { describe, expect, it } from 'vitest'
import {
  classifyGoldRank,
  computeGoldRank,
  evaluateGoldSpecific,
  GOLD_HISTORICAL_SAMPLES,
} from './goldSpecificManipulation'

const TEN = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]

describe('computeGoldRank', () => {
  it('is the share of historical ranges <= the current range', () => {
    expect(computeGoldRank(55, TEN)).toEqual({ rank: 50, sampleCount: 10 })
    expect(computeGoldRank(100, TEN)).toEqual({ rank: 100, sampleCount: 10 })
    expect(computeGoldRank(5, TEN)).toEqual({ rank: 0, sampleCount: 10 })
  })

  it('ignores non-positive samples and caps at the sample target', () => {
    const many = [...Array(GOLD_HISTORICAL_SAMPLES).fill(10), ...Array(5).fill(1000)]
    // Only the first 20 (all 10) are considered → current 10 ranks at 100%.
    expect(computeGoldRank(10, many)).toEqual({ rank: 100, sampleCount: GOLD_HISTORICAL_SAMPLES })
    expect(computeGoldRank(50, [0, -1, 50])).toEqual({ rank: 100, sampleCount: 1 })
  })
})

describe('classifyGoldRank', () => {
  it('applies the EA percentile thresholds', () => {
    expect(classifyGoldRank(0)).toBe('NORMAL')
    expect(classifyGoldRank(59)).toBe('NORMAL')
    expect(classifyGoldRank(60)).toBe('ELEVATED')
    expect(classifyGoldRank(80)).toBe('LARGE')
    expect(classifyGoldRank(95)).toBe('EXTREME')
    expect(classifyGoldRank(100)).toBe('EXTREME')
  })
})

describe('evaluateGoldSpecific', () => {
  it('reports INSUFFICIENT_HISTORY below the minimum sample count', () => {
    const result = evaluateGoldSpecific({ currentRange: 50, historicalRanges: [10, 20, 30] })
    expect(result.classification).toBe('INSUFFICIENT_HISTORY')
    expect(result.manipulation).toBeNull()
    expect(result.sampleCount).toBe(3)
  })

  it('marks NORMAL as not manipulation', () => {
    const result = evaluateGoldSpecific({ currentRange: 40, historicalRanges: TEN })
    expect(result.classification).toBe('NORMAL')
    expect(result.manipulation).toBe(false)
  })

  it('marks ELEVATED / LARGE / EXTREME as manipulation', () => {
    expect(evaluateGoldSpecific({ currentRange: 65, historicalRanges: TEN }).classification).toBe('ELEVATED')
    expect(evaluateGoldSpecific({ currentRange: 85, historicalRanges: TEN })).toMatchObject({
      classification: 'LARGE',
      manipulation: true,
    })
    expect(evaluateGoldSpecific({ currentRange: 100, historicalRanges: TEN }).manipulation).toBe(true)
  })
})
