import { describe, expect, it } from 'vitest'
import { isTraderAlertAllowed, type OpeningProfile } from '../openingProfile/openingProfileRules'
import { migrateOrbAlertToMarketEvent, type OrbAlert } from './orbStateStore'

const profile = (overrides: Partial<OpeningProfile> = {}): OpeningProfile => ({
  id: 'tokyo-fx',
  displayName: 'Tokyo FX',
  timezone: 'Asia/Tokyo',
  openingTime: '09:00',
  closingTime: '15:00',
  orbTimeframe: 'M15',
  manipulationMode: 'normal',
  alertMode: 'all_breakouts',
  trendTimeframe: 'H1',
  trendEmaPeriod: 200,
  tradingWindowMinutes: 120,
  allowTradesAfterWindow: false,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  ...overrides,
})

describe('market event migration and window eligibility', () => {
  it('maps legacy OrbAlert high/low records to market event types', () => {
    const high = migrateOrbAlertToMarketEvent({
      id: 'a1',
      symbolId: '41',
      instrument: 'XAUUSD',
      displayName: 'Gold',
      profileId: 'tokyo-fx',
      openingProfile: 'Tokyo FX',
      tradingDate: '2026-07-22',
      event: 'ORB Breakout',
      direction: 'Up',
      triggerPrice: 2401,
      orbHigh: 2400,
      orbLow: 2390,
      openingCandleDirection: 'bullish',
      manipulation: true,
      manipulationMode: 'gold_specific',
      classification: 'LARGE',
      rank: 0.8,
      trend: 'bullish',
      timeUtc: '2026-07-22T01:00:00.000Z',
      message: 'ORB High Broken · Manipulation Large',
    } satisfies OrbAlert)

    expect(high.eventType).toBe('orb_high_broken')
    expect(high.direction).toBe('bullish')
    expect(high.manipulationCategory).toBe('large')

    const low = migrateOrbAlertToMarketEvent({
      ...high,
      id: 'a2',
      direction: 'Down',
      message: 'ORB Low Broken',
    } as OrbAlert)
    expect(low.eventType).toBe('orb_low_broken')
  })

  it('marks trader alerts ineligible when the window is closed and extended monitoring is off', () => {
    const tokyo = profile({ allowTradesAfterWindow: false })
    // Opening 00:00 UTC → window end 02:00 UTC for tradingDate 2026-07-22 in the test profile
    // isTraderAlertAllowed uses computeTradingWindowEndUtc from opening instant.
    expect(isTraderAlertAllowed(tokyo, '2026-07-22', new Date('2026-07-22T03:00:00.000Z'))).toBe(false)
  })

  it('keeps trader alerts eligible after the window when extended monitoring is on', () => {
    const tokyo = profile({ allowTradesAfterWindow: true })
    expect(isTraderAlertAllowed(tokyo, '2026-07-22', new Date('2026-07-22T03:00:00.000Z'))).toBe(true)
  })
})
