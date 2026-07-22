import { describe, expect, it } from 'vitest'
import {
  buildOpeningProfile,
  computeTradingWindowEndUtc,
  isTraderAlertAllowed,
  seedOpeningProfiles,
} from './openingProfileRules'

const NOW = '2026-07-22T00:00:00.000Z'

describe('trading window configuration', () => {
  it('defaults to 120 minutes and allowTradesAfterWindow true', () => {
    const profile = buildOpeningProfile(
      { displayName: 'London FX', timezone: 'Europe/London', openingTime: '08:00' },
      NOW,
    )
    expect(profile.tradingWindowMinutes).toBe(120)
    expect(profile.allowTradesAfterWindow).toBe(true)
    expect(profile.closingTime).toBe('17:00')
  })

  it('seeds Tokyo with a 15:00 close', () => {
    const tokyo = seedOpeningProfiles(NOW).find((profile) => profile.id === 'tokyo-fx')
    expect(tokyo?.closingTime).toBe('15:00')
    expect(tokyo?.tradingWindowMinutes).toBe(120)
  })

  it('computes trading window end from open + duration', () => {
    const profile = buildOpeningProfile(
      {
        displayName: 'Tokyo FX',
        timezone: 'Asia/Tokyo',
        openingTime: '09:00',
        closingTime: '15:00',
        tradingWindowMinutes: 120,
      },
      NOW,
    )
    // 2026-07-22 Tokyo 09:00 = 2026-07-22T00:00:00Z; +120m = 02:00Z
    expect(computeTradingWindowEndUtc(profile, '2026-07-22').toISOString()).toBe('2026-07-22T02:00:00.000Z')
  })

  it('allows alerts inside the window even when allowTradesAfterWindow is false', () => {
    const profile = buildOpeningProfile(
      {
        displayName: 'Tokyo FX',
        timezone: 'Asia/Tokyo',
        openingTime: '09:00',
        tradingWindowMinutes: 120,
        allowTradesAfterWindow: false,
      },
      NOW,
    )
    expect(isTraderAlertAllowed(profile, '2026-07-22', new Date('2026-07-22T01:00:00.000Z'))).toBe(true)
    expect(isTraderAlertAllowed(profile, '2026-07-22', new Date('2026-07-22T02:00:01.000Z'))).toBe(false)
  })

  it('allows alerts after the window when allowTradesAfterWindow is true', () => {
    const profile = buildOpeningProfile(
      {
        displayName: 'Tokyo FX',
        timezone: 'Asia/Tokyo',
        openingTime: '09:00',
        tradingWindowMinutes: 120,
        allowTradesAfterWindow: true,
      },
      NOW,
    )
    expect(isTraderAlertAllowed(profile, '2026-07-22', new Date('2026-07-22T05:00:00.000Z'))).toBe(true)
  })
})
