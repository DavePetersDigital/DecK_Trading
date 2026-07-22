import { describe, expect, it } from 'vitest'
import { detectCandleCloseBreakout } from './orbCandleBreakout'

const ORB_HIGH = 100
const ORB_LOW = 90
const AFTER = Date.parse('2026-07-22T00:15:00.000Z') // opening candle close
const M5 = 5 * 60 * 1000

describe('detectCandleCloseBreakout', () => {
  it('ignores wick-only penetration (close still inside)', () => {
    const candles = [
      { time: '2026-07-22T00:15:00.000Z', open: 95, high: 101, low: 94, close: 96 },
    ]
    const now = new Date('2026-07-22T00:25:00.000Z')
    expect(detectCandleCloseBreakout(candles, ORB_HIGH, ORB_LOW, AFTER, M5, now).direction).toBeNull()
  })

  it('detects ORB high broken on completed M5 close', () => {
    const candles = [
      { time: '2026-07-22T00:15:00.000Z', open: 95, high: 101, low: 94, close: 100.5 },
    ]
    const now = new Date('2026-07-22T00:25:00.000Z')
    const result = detectCandleCloseBreakout(candles, ORB_HIGH, ORB_LOW, AFTER, M5, now)
    expect(result.direction).toBe('high')
    expect(result.confirmedAt).toBe('2026-07-22T00:20:00.000Z')
  })

  it('detects ORB low broken on completed M5 close', () => {
    const candles = [
      { time: '2026-07-22T00:15:00.000Z', open: 95, high: 96, low: 88, close: 89 },
    ]
    const now = new Date('2026-07-22T00:25:00.000Z')
    expect(detectCandleCloseBreakout(candles, ORB_HIGH, ORB_LOW, AFTER, M5, now).direction).toBe('low')
  })

  it('ignores still-forming candles', () => {
    const candles = [
      { time: '2026-07-22T00:20:00.000Z', open: 95, high: 102, low: 94, close: 101 },
    ]
    const now = new Date('2026-07-22T00:22:00.000Z') // M5 not complete yet
    expect(detectCandleCloseBreakout(candles, ORB_HIGH, ORB_LOW, AFTER, M5, now).direction).toBeNull()
  })

  it('latches the earliest chronological breakout', () => {
    const candles = [
      { time: '2026-07-22T00:15:00.000Z', open: 95, high: 101, low: 94, close: 100.5 },
      { time: '2026-07-22T00:20:00.000Z', open: 100, high: 100, low: 88, close: 89 },
    ]
    const now = new Date('2026-07-22T00:30:00.000Z')
    expect(detectCandleCloseBreakout(candles, ORB_HIGH, ORB_LOW, AFTER, M5, now).direction).toBe('high')
  })
})
