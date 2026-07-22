import { describe, expect, it } from 'vitest'
import { advanceOrbZoneFromCandles, emptyOrbZoneSnapshot, zoneFromClose } from './orbZoneState'
import { marketEventDedupeKey } from './marketEvent'

const ORB_HIGH = 100
const ORB_LOW = 90
const AFTER = Date.parse('2026-07-22T00:15:00.000Z')
const M5 = 5 * 60 * 1000

function candle(time: string, close: number) {
  return { time, open: close, high: close, low: close, close }
}

describe('ORB zone state machine', () => {
  it('treats boundary equality as inside', () => {
    expect(zoneFromClose(100, ORB_HIGH, ORB_LOW)).toBe('inside')
    expect(zoneFromClose(90, ORB_HIGH, ORB_LOW)).toBe('inside')
    expect(zoneFromClose(100.1, ORB_HIGH, ORB_LOW)).toBe('broken_above')
    expect(zoneFromClose(89.9, ORB_HIGH, ORB_LOW)).toBe('broken_below')
  })

  it('generates one ORB High Broken when M5 closes above ORB High', () => {
    const now = new Date('2026-07-22T00:25:00.000Z')
    const result = advanceOrbZoneFromCandles(
      emptyOrbZoneSnapshot(),
      [candle('2026-07-22T00:15:00.000Z', 100.5)],
      ORB_HIGH,
      ORB_LOW,
      AFTER,
      M5,
      'M5',
      now,
    )
    expect(result.transitions).toHaveLength(1)
    expect(result.transitions[0]!.eventType).toBe('orb_high_broken')
    expect(result.snapshot.zone).toBe('broken_above')
    expect(result.snapshot.direction).toBe('high')
  })

  it('does not duplicate when the same completed candle is processed twice', () => {
    const now = new Date('2026-07-22T00:25:00.000Z')
    const candles = [candle('2026-07-22T00:15:00.000Z', 100.5)]
    const first = advanceOrbZoneFromCandles(
      emptyOrbZoneSnapshot(),
      candles,
      ORB_HIGH,
      ORB_LOW,
      AFTER,
      M5,
      'M5',
      now,
    )
    const second = advanceOrbZoneFromCandles(
      first.snapshot,
      candles,
      ORB_HIGH,
      ORB_LOW,
      AFTER,
      M5,
      'M5',
      now,
    )
    expect(first.transitions).toHaveLength(1)
    expect(second.transitions).toHaveLength(0)
    expect(second.snapshot.zone).toBe('broken_above')

    const key = marketEventDedupeKey({
      instrumentId: '1',
      openingProfileId: 'london-fx',
      tradingDate: '2026-07-22',
      timeframe: 'M5',
      eventType: 'orb_high_broken',
      candleCloseTime: first.transitions[0]!.candleCloseTime,
    })
    expect(key).toContain('orb_high_broken')
  })

  it('generates Returned to ORB when the next M5 closes inside after a breakout', () => {
    const now = new Date('2026-07-22T00:30:00.000Z')
    const result = advanceOrbZoneFromCandles(
      emptyOrbZoneSnapshot(),
      [
        candle('2026-07-22T00:15:00.000Z', 100.5),
        candle('2026-07-22T00:20:00.000Z', 95),
      ],
      ORB_HIGH,
      ORB_LOW,
      AFTER,
      M5,
      'M5',
      now,
    )
    expect(result.transitions.map((item) => item.eventType)).toEqual([
      'orb_high_broken',
      'returned_to_orb',
    ])
    expect(result.snapshot.zone).toBe('inside')
    expect(result.snapshot.hadBreakout).toBe(true)
    expect(result.snapshot.direction).toBeNull()
  })

  it('does not emit additional Returned to ORB while price remains inside', () => {
    const now = new Date('2026-07-22T00:45:00.000Z')
    const result = advanceOrbZoneFromCandles(
      emptyOrbZoneSnapshot(),
      [
        candle('2026-07-22T00:15:00.000Z', 100.5),
        candle('2026-07-22T00:20:00.000Z', 95),
        candle('2026-07-22T00:25:00.000Z', 96),
        candle('2026-07-22T00:30:00.000Z', 97),
        candle('2026-07-22T00:35:00.000Z', 94),
      ],
      ORB_HIGH,
      ORB_LOW,
      AFTER,
      M5,
      'M5',
      now,
    )
    expect(result.transitions.map((item) => item.eventType)).toEqual([
      'orb_high_broken',
      'returned_to_orb',
    ])
  })

  it('allows a new Returned to ORB after a later opposite breakout', () => {
    const now = new Date('2026-07-22T00:50:00.000Z')
    const result = advanceOrbZoneFromCandles(
      emptyOrbZoneSnapshot(),
      [
        candle('2026-07-22T00:15:00.000Z', 100.5),
        candle('2026-07-22T00:20:00.000Z', 95),
        candle('2026-07-22T00:25:00.000Z', 89),
        candle('2026-07-22T00:30:00.000Z', 94),
      ],
      ORB_HIGH,
      ORB_LOW,
      AFTER,
      M5,
      'M5',
      now,
    )
    expect(result.transitions.map((item) => item.eventType)).toEqual([
      'orb_high_broken',
      'returned_to_orb',
      'orb_low_broken',
      'returned_to_orb',
    ])
  })

  it('keeps M5 and M15 zone states independent', () => {
    const now = new Date('2026-07-22T00:40:00.000Z')
    const m5 = advanceOrbZoneFromCandles(
      emptyOrbZoneSnapshot(),
      [candle('2026-07-22T00:15:00.000Z', 100.5)],
      ORB_HIGH,
      ORB_LOW,
      AFTER,
      M5,
      'M5',
      now,
    )
    const m15 = advanceOrbZoneFromCandles(
      emptyOrbZoneSnapshot(),
      [candle('2026-07-22T00:15:00.000Z', 95)],
      ORB_HIGH,
      ORB_LOW,
      AFTER,
      15 * 60 * 1000,
      'M15',
      now,
    )
    expect(m5.snapshot.zone).toBe('broken_above')
    expect(m15.snapshot.zone).toBe('inside')
    expect(m15.transitions).toHaveLength(0)
  })

  it('does not generate Returned to ORB from a still-forming candle', () => {
    const broken = advanceOrbZoneFromCandles(
      emptyOrbZoneSnapshot(),
      [candle('2026-07-22T00:15:00.000Z', 100.5)],
      ORB_HIGH,
      ORB_LOW,
      AFTER,
      M5,
      'M5',
      new Date('2026-07-22T00:25:00.000Z'),
    )
    const live = advanceOrbZoneFromCandles(
      broken.snapshot,
      [
        candle('2026-07-22T00:15:00.000Z', 100.5),
        candle('2026-07-22T00:20:00.000Z', 95), // still forming at 00:22
      ],
      ORB_HIGH,
      ORB_LOW,
      AFTER,
      M5,
      'M5',
      new Date('2026-07-22T00:22:00.000Z'),
    )
    expect(live.transitions).toHaveLength(0)
    expect(live.snapshot.zone).toBe('broken_above')
  })
})
