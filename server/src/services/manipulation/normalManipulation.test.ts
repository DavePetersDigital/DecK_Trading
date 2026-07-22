import { describe, expect, it } from 'vitest'
import { evaluateManipulation } from './manipulationEngine'
import {
  classifyAtrPercentage,
  evaluateNormal,
  NORMAL_ATR_PERIOD,
  NORMAL_EXTREME_THRESHOLD,
  NORMAL_LARGE_THRESHOLD,
  NORMAL_NO_THRESHOLD,
} from './normalManipulation'
import { evaluateGoldSpecific } from './goldSpecificManipulation'

describe('classifyAtrPercentage thresholds', () => {
  it('uses exact inclusive lower bounds', () => {
    expect(classifyAtrPercentage(19.999)).toBe('no')
    expect(classifyAtrPercentage(NORMAL_NO_THRESHOLD)).toBe('normal')
    expect(classifyAtrPercentage(49.999)).toBe('normal')
    expect(classifyAtrPercentage(NORMAL_LARGE_THRESHOLD)).toBe('large')
    expect(classifyAtrPercentage(69.999)).toBe('large')
    expect(classifyAtrPercentage(NORMAL_EXTREME_THRESHOLD)).toBe('extreme')
  })
})

describe('evaluateNormal ATR classification', () => {
  const atr = 100

  it('classifies 10% of ATR as No with manipulation false', () => {
    const result = evaluateNormal({
      currentRange: 10,
      historicalRanges: [],
      dailyAtr: atr,
      atrSampleCount: NORMAL_ATR_PERIOD,
    })
    expect(result.manipulation).toBe(false)
    expect(result.classification).toBe('NORMAL')
    expect(result.rank).toBeCloseTo(10)
    expect(result.mode).toBe('normal')
  })

  it('classifies exactly 20% of ATR as Normal with manipulation true', () => {
    const result = evaluateNormal({
      currentRange: 20,
      historicalRanges: [],
      dailyAtr: atr,
      atrSampleCount: NORMAL_ATR_PERIOD,
    })
    expect(result.manipulation).toBe(true)
    expect(result.classification).toBe('NORMAL')
    expect(result.rank).toBeCloseTo(20)
  })

  it('classifies 35% of ATR as Normal', () => {
    const result = evaluateNormal({
      currentRange: 35,
      historicalRanges: [],
      dailyAtr: atr,
      atrSampleCount: NORMAL_ATR_PERIOD,
    })
    expect(result.manipulation).toBe(true)
    expect(result.classification).toBe('NORMAL')
  })

  it('classifies exactly 50% of ATR as Large', () => {
    const result = evaluateNormal({
      currentRange: 50,
      historicalRanges: [],
      dailyAtr: atr,
      atrSampleCount: NORMAL_ATR_PERIOD,
    })
    expect(result.manipulation).toBe(true)
    expect(result.classification).toBe('LARGE')
  })

  it('classifies 60% of ATR as Large', () => {
    const result = evaluateNormal({
      currentRange: 60,
      historicalRanges: [],
      dailyAtr: atr,
      atrSampleCount: NORMAL_ATR_PERIOD,
    })
    expect(result.classification).toBe('LARGE')
  })

  it('classifies exactly 70% of ATR as Extreme', () => {
    const result = evaluateNormal({
      currentRange: 70,
      historicalRanges: [],
      dailyAtr: atr,
      atrSampleCount: NORMAL_ATR_PERIOD,
    })
    expect(result.classification).toBe('EXTREME')
    expect(result.manipulation).toBe(true)
  })

  it('classifies greater than 100% of ATR as Extreme', () => {
    const result = evaluateNormal({
      currentRange: 150,
      historicalRanges: [],
      dailyAtr: atr,
      atrSampleCount: NORMAL_ATR_PERIOD,
    })
    expect(result.classification).toBe('EXTREME')
    expect(result.rank).toBeCloseTo(150)
  })

  it('returns non-actionable result when ATR is missing', () => {
    const result = evaluateNormal({
      currentRange: 30,
      historicalRanges: [],
      dailyAtr: null,
      atrSampleCount: 0,
    })
    expect(result.manipulation).toBeNull()
    expect(result.classification).toBe('INSUFFICIENT_HISTORY')
    expect(result.rank).toBeNull()
  })

  it('returns non-actionable result when ATR is zero', () => {
    const result = evaluateNormal({
      currentRange: 30,
      historicalRanges: [],
      dailyAtr: 0,
      atrSampleCount: NORMAL_ATR_PERIOD,
    })
    expect(result.manipulation).toBeNull()
    expect(result.classification).toBe('INSUFFICIENT_HISTORY')
  })

  it('returns INSUFFICIENT_HISTORY when Daily history is short', () => {
    const result = evaluateNormal({
      currentRange: 30,
      historicalRanges: [],
      dailyAtr: null,
      atrSampleCount: 5,
    })
    expect(result.classification).toBe('INSUFFICIENT_HISTORY')
    expect(result.sampleCount).toBe(5)
    expect(result.message).toContain('Insufficient Daily history')
  })

  it('rejects negative ATR and non-finite range', () => {
    expect(
      evaluateNormal({
        currentRange: 10,
        historicalRanges: [],
        dailyAtr: -1,
        atrSampleCount: 14,
      }).manipulation,
    ).toBeNull()
    expect(
      evaluateNormal({
        currentRange: Number.NaN,
        historicalRanges: [],
        dailyAtr: 100,
        atrSampleCount: 14,
      }).manipulation,
    ).toBeNull()
  })
})

describe('evaluateManipulation routing', () => {
  it('routes Gold to the gold-specific algorithm', () => {
    const viaEngine = evaluateManipulation('gold_specific', {
      currentRange: 50,
      historicalRanges: Array.from({ length: 20 }, () => 40),
    })
    const direct = evaluateGoldSpecific({
      currentRange: 50,
      historicalRanges: Array.from({ length: 20 }, () => 40),
    })
    expect(viaEngine.mode).toBe('gold_specific')
    expect(viaEngine.classification).toBe(direct.classification)
    expect(viaEngine.manipulation).toBe(direct.manipulation)
  })

  it('routes non-Gold to the normal ATR algorithm', () => {
    const result = evaluateManipulation('normal', {
      currentRange: 25,
      historicalRanges: [],
      dailyAtr: 100,
      atrSampleCount: 14,
    })
    expect(result.mode).toBe('normal')
    expect(result.manipulation).toBe(true)
    expect(result.classification).toBe('NORMAL')
    expect(result.rank).toBeCloseTo(25)
  })
})
