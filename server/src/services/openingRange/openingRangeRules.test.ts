import { describe, expect, it } from 'vitest'
import {
  buildOpeningRange,
  collectHistoricalRanges,
  directionOf,
  findOpeningCandle,
  isCandleComplete,
  type OhlcCandle,
} from './openingRangeRules'

function candle(time: string, open: number, high: number, low: number, close: number): OhlcCandle {
  return { time, open, high, low, close }
}

describe('directionOf', () => {
  it('classifies bullish / bearish / doji', () => {
    expect(directionOf(100, 105)).toBe('bullish')
    expect(directionOf(105, 100)).toBe('bearish')
    expect(directionOf(100, 100)).toBe('doji')
  })
})

describe('findOpeningCandle', () => {
  const candles = [
    candle('2026-07-21T06:45:00.000Z', 1, 2, 0.5, 1.5),
    candle('2026-07-21T07:00:00.000Z', 1.5, 3, 1.4, 2.8),
    candle('2026-07-21T07:15:00.000Z', 2.8, 3.2, 2.5, 3.0),
  ]

  it('returns the candle whose start equals the opening instant', () => {
    const found = findOpeningCandle(candles, new Date('2026-07-21T07:00:00.000Z'))
    expect(found?.close).toBe(2.8)
  })

  it('returns null when no candle matches (incomplete/missing)', () => {
    expect(findOpeningCandle(candles, new Date('2026-07-21T08:00:00.000Z'))).toBeNull()
  })
})

describe('isCandleComplete', () => {
  const c = candle('2026-07-21T07:00:00.000Z', 1, 2, 0.5, 1.5)
  it('is complete only after the full period elapsed', () => {
    expect(isCandleComplete(c, new Date('2026-07-21T07:14:59.000Z'))).toBe(false)
    expect(isCandleComplete(c, new Date('2026-07-21T07:15:00.000Z'))).toBe(true)
  })
})

describe('buildOpeningRange', () => {
  it('computes range and direction from a completed candle', () => {
    const range = buildOpeningRange(candle('2026-07-21T07:00:00.000Z', 100, 110, 95, 108))
    expect(range).toEqual({ open: 100, high: 110, low: 95, close: 108, range: 15, direction: 'bullish' })
  })

  it('rejects an invalid candle (high < low)', () => {
    expect(buildOpeningRange(candle('t', 1, 0.5, 1, 0.8))).toBeNull()
  })
})

describe('collectHistoricalRanges', () => {
  it('extracts high-low for matching opening instants, newest first, up to the limit', () => {
    const candles = [
      candle('2026-07-20T07:00:00.000Z', 1, 5, 1, 4), // range 4
      candle('2026-07-17T07:00:00.000Z', 1, 3, 1, 2), // range 2
      candle('2026-07-16T07:00:00.000Z', 1, 9, 1, 8), // range 8
      candle('2026-07-15T07:00:00.000Z', 1, 1, 1, 1), // range 0 → skipped
    ]
    const instants = [
      new Date('2026-07-20T07:00:00.000Z'),
      new Date('2026-07-17T07:00:00.000Z'),
      new Date('2026-07-16T07:00:00.000Z'),
      new Date('2026-07-15T07:00:00.000Z'),
    ]
    expect(collectHistoricalRanges(candles, instants, 10)).toEqual([4, 2, 8])
    expect(collectHistoricalRanges(candles, instants, 2)).toEqual([4, 2])
  })
})
