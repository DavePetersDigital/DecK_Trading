import { describe, expect, it } from 'vitest'
import { calculateBiasFromEma, calculateEma } from './ema'

describe('calculateEma', () => {
  it('returns null when fewer than period closes are available', () => {
    expect(calculateEma(Array.from({ length: 199 }, (_, i) => i + 1), 200)).toBeNull()
  })

  it('initialises with the SMA of the first period closes', () => {
    const closes = Array.from({ length: 200 }, () => 10)
    const result = calculateEma(closes, 200)
    expect(result).not.toBeNull()
    expect(result!.value).toBeCloseTo(10, 12)
  })

  it('applies the standard EMA recurrence after the SMA seed', () => {
    const closes = [
      ...Array.from({ length: 3 }, () => 10),
      20,
    ]
    // period 3: seed SMA = 10; k = 2/4 = 0.5
    // EMA = 20*0.5 + 10*0.5 = 15
    const result = calculateEma(closes, 3)
    expect(result).not.toBeNull()
    expect(result!.value).toBeCloseTo(15, 12)
  })
})

describe('calculateBiasFromEma', () => {
  it('returns Bullish when live mid is above the EMA', () => {
    expect(calculateBiasFromEma(4010, 4000)).toBe('Bullish')
  })

  it('returns Bearish when live mid is below the EMA', () => {
    expect(calculateBiasFromEma(3990, 4000)).toBe('Bearish')
  })

  it('returns null when price equals the EMA or inputs are missing', () => {
    expect(calculateBiasFromEma(4000, 4000)).toBeNull()
    expect(calculateBiasFromEma(null, 4000)).toBeNull()
    expect(calculateBiasFromEma(4000, null)).toBeNull()
  })
})
