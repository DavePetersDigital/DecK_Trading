import { describe, expect, it } from 'vitest'
import { calculateTrueRange, calculateWilderAtr } from './atr'

describe('calculateTrueRange', () => {
  it('uses the largest of high-low and gaps from previous close', () => {
    expect(calculateTrueRange(110, 100, 105)).toBe(10)
    expect(calculateTrueRange(120, 115, 100)).toBe(20)
    expect(calculateTrueRange(90, 80, 100)).toBe(20)
  })
})

describe('calculateWilderAtr', () => {
  it('returns null when fewer than period + 1 candles are available', () => {
    const candles = Array.from({ length: 14 }, (_, index) => ({
      high: 10 + index,
      low: 9 + index,
      close: 9.5 + index,
      time: `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
    }))
    expect(calculateWilderAtr(candles, 14)).toBeNull()
  })

  it('uses the simple average of the first 14 true ranges as the initial ATR', () => {
    const candles = [
      { high: 10, low: 9, close: 9.5, time: 't0' },
      ...Array.from({ length: 14 }, (_, index) => ({
        high: 12,
        low: 10,
        close: 11,
        time: `t${index + 1}`,
      })),
    ]
    // Each TR = max(2, |12-9.5|, |10-9.5|) for first, then max(2,1,1)=2 thereafter
    // First candle previous close 9.5: TR = max(2, 2.5, 0.5) = 2.5
    // Remaining 13: previous close 11: TR = max(2, 1, 1) = 2
    const result = calculateWilderAtr(candles, 14)
    expect(result).not.toBeNull()
    const expected = (2.5 + (2 * 13)) / 14
    expect(result!.value).toBeCloseTo(expected, 12)
    expect(result!.candleTime).toBe('t14')
  })

  it('applies Wilder smoothing for subsequent true ranges', () => {
    const seed = [
      { high: 10, low: 8, close: 9, time: 't0' },
      ...Array.from({ length: 14 }, (_, index) => ({
        high: 12,
        low: 10,
        close: 11,
        time: `t${index + 1}`,
      })),
    ]
    // TR0 = max(2,3,1)=3; TR1..13 = 2 → initial ATR = (3 + 26) / 14 = 29/14
    const initial = (3 + (2 * 13)) / 14

    const withExtra = [
      ...seed,
      { high: 20, low: 10, close: 15, time: 't15' }, // TR = max(10, 9, 1) = 10
    ]
    const result = calculateWilderAtr(withExtra, 14)
    expect(result).not.toBeNull()
    const expected = ((initial * 13) + 10) / 14
    expect(result!.value).toBeCloseTo(expected, 12)
    expect(result!.candleTime).toBe('t15')
  })
})
