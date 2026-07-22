import { describe, expect, it } from 'vitest'
import { calculateTrueRange, calculateWilderAtr, selectCompletedDailyCandles } from './wilderAtr'

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
    const result = calculateWilderAtr(candles, 14)
    expect(result).not.toBeNull()
    const expected = (2.5 + 2 * 13) / 14
    expect(result!.value).toBeCloseTo(expected, 12)
  })
})

describe('selectCompletedDailyCandles', () => {
  it('excludes the still-forming Daily candle', () => {
    const now = new Date('2026-07-22T12:00:00.000Z')
    const candles = [
      { time: '2026-07-20T00:00:00.000Z', high: 1, low: 0, close: 1 },
      { time: '2026-07-21T00:00:00.000Z', high: 1, low: 0, close: 1 },
      { time: '2026-07-22T00:00:00.000Z', high: 1, low: 0, close: 1 }, // incomplete at noon
    ]
    const completed = selectCompletedDailyCandles(candles, now)
    expect(completed.map((candle) => candle.time)).toEqual([
      '2026-07-20T00:00:00.000Z',
      '2026-07-21T00:00:00.000Z',
    ])
  })
})
