import { describe, expect, it } from 'vitest'
import { calculateEma, classifyTrend } from './ema'

describe('calculateEma', () => {
  it('returns null when there are fewer closes than the period', () => {
    expect(calculateEma([1, 2], 5)).toBeNull()
  })

  it('rejects invalid periods', () => {
    expect(calculateEma([1, 2, 3], 0)).toBeNull()
    expect(calculateEma([1, 2, 3], 1.5)).toBeNull()
  })

  it('rejects non-finite closes', () => {
    expect(calculateEma([1, Number.NaN, 3], 2)).toBeNull()
  })

  it('seeds with the SMA and matches a hand-computed EMA', () => {
    // period 3, seed = SMA(2,4,6) = 4, k = 0.5
    // next close 8 => 8*0.5 + 4*0.5 = 6
    // next close 10 => 10*0.5 + 6*0.5 = 8
    expect(calculateEma([2, 4, 6], 3)).toBe(4)
    expect(calculateEma([2, 4, 6, 8], 3)).toBe(6)
    expect(calculateEma([2, 4, 6, 8, 10], 3)).toBe(8)
  })
})

describe('classifyTrend', () => {
  it('is bullish when price is above the EMA', () => {
    expect(classifyTrend(105, 100)).toBe('bullish')
  })

  it('is bearish when price is below the EMA', () => {
    expect(classifyTrend(95, 100)).toBe('bearish')
  })

  it('is null when equal or missing', () => {
    expect(classifyTrend(100, 100)).toBeNull()
    expect(classifyTrend(null, 100)).toBeNull()
    expect(classifyTrend(100, null)).toBeNull()
  })
})
