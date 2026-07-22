import { describe, expect, it } from 'vitest'
import {
  applyOpeningProfilePatch,
  buildOpeningProfile,
  computeOpeningInstantUtc,
  DEFAULT_OPENING_PROFILE_SEEDS,
  OpeningProfileValidationError,
  parseOpeningTime,
  previousTradingDates,
  seedOpeningProfiles,
  tradingDateForInstant,
  type OpeningProfile,
} from './openingProfileRules'

const NOW = '2026-07-21T00:00:00.000Z'

function seed(id: string): OpeningProfile {
  const found = seedOpeningProfiles(NOW).find((profile) => profile.id === id)
  if (!found) throw new Error(`missing seed ${id}`)
  return found
}

describe('default opening profile seeds', () => {
  it('defines the four reference profiles with IANA timezones', () => {
    const ids = DEFAULT_OPENING_PROFILE_SEEDS.map((profile) => profile.id)
    expect(ids).toEqual(['tokyo-fx', 'london-fx', 'new-york-fx', 'new-york-equities'])
    expect(seed('tokyo-fx').timezone).toBe('Asia/Tokyo')
    expect(seed('london-fx').timezone).toBe('Europe/London')
    expect(seed('new-york-fx').timezone).toBe('America/New_York')
    expect(seed('new-york-equities').openingTime).toBe('09:30')
  })
})

describe('computeOpeningInstantUtc (DST-safe)', () => {
  it('Tokyo 09:00 has no DST → always 00:00 UTC', () => {
    expect(computeOpeningInstantUtc(seed('tokyo-fx'), '2026-07-21').toISOString()).toBe('2026-07-21T00:00:00.000Z')
    expect(computeOpeningInstantUtc(seed('tokyo-fx'), '2026-01-15').toISOString()).toBe('2026-01-15T00:00:00.000Z')
  })

  it('London 08:00 → 07:00 UTC in BST, 08:00 UTC in GMT', () => {
    expect(computeOpeningInstantUtc(seed('london-fx'), '2026-07-21').toISOString()).toBe('2026-07-21T07:00:00.000Z')
    expect(computeOpeningInstantUtc(seed('london-fx'), '2026-01-15').toISOString()).toBe('2026-01-15T08:00:00.000Z')
  })

  it('New York FX 09:00 → 13:00 UTC in EDT, 14:00 UTC in EST', () => {
    expect(computeOpeningInstantUtc(seed('new-york-fx'), '2026-07-21').toISOString()).toBe('2026-07-21T13:00:00.000Z')
    expect(computeOpeningInstantUtc(seed('new-york-fx'), '2026-01-15').toISOString()).toBe('2026-01-15T14:00:00.000Z')
  })

  it('New York Equities 09:30 → 13:30 UTC in EDT, 14:30 UTC in EST', () => {
    expect(computeOpeningInstantUtc(seed('new-york-equities'), '2026-07-21').toISOString()).toBe('2026-07-21T13:30:00.000Z')
    expect(computeOpeningInstantUtc(seed('new-york-equities'), '2026-01-15').toISOString()).toBe('2026-01-15T14:30:00.000Z')
  })

  it('resolves correctly across a DST transition day (London 2026-03-29)', () => {
    // UK clocks go forward on 2026-03-29; 08:00 local is already BST → 07:00Z.
    expect(computeOpeningInstantUtc(seed('london-fx'), '2026-03-29').toISOString()).toBe('2026-03-29T07:00:00.000Z')
  })
})

describe('tradingDateForInstant', () => {
  it('reports the calendar date within the profile timezone', () => {
    // 23:30 UTC on 2026-07-20 is already 2026-07-21 in Tokyo.
    expect(tradingDateForInstant('Asia/Tokyo', new Date('2026-07-20T23:30:00Z'))).toBe('2026-07-21')
    // 01:00 UTC is still the previous day in New York.
    expect(tradingDateForInstant('America/New_York', new Date('2026-07-21T01:00:00Z'))).toBe('2026-07-20')
  })
})

describe('previousTradingDates', () => {
  it('returns weekdays only, newest first', () => {
    expect(previousTradingDates('2026-07-21', 5)).toEqual([
      '2026-07-20',
      '2026-07-17',
      '2026-07-16',
      '2026-07-15',
      '2026-07-14',
    ])
  })
})

describe('validation', () => {
  it('parses HH:MM and rejects invalid times', () => {
    expect(parseOpeningTime('09:30')).toEqual({ hour: 9, minute: 30 })
    expect(() => parseOpeningTime('24:00')).toThrow(OpeningProfileValidationError)
    expect(() => parseOpeningTime('9')).toThrow(OpeningProfileValidationError)
  })

  it('builds a normalised profile and derives an id from displayName', () => {
    const profile = buildOpeningProfile(
      { displayName: 'Sydney FX', timezone: 'Australia/Sydney', openingTime: '7:00', manipulationMode: 'normal' },
      NOW,
    )
    expect(profile.id).toBe('sydney-fx')
    expect(profile.openingTime).toBe('07:00')
    expect(profile.orbTimeframe).toBe('M15')
    expect(profile.manipulationMode).toBe('normal')
  })

  it('rejects invalid timezones and orb timeframes', () => {
    expect(() => buildOpeningProfile({ displayName: 'X', timezone: 'Mars/Phobos', openingTime: '08:00' }, NOW))
      .toThrow(OpeningProfileValidationError)
    expect(() => buildOpeningProfile({ displayName: 'X', timezone: 'Europe/London', openingTime: '08:00', orbTimeframe: 'M5' }, NOW))
      .toThrow(/orbTimeframe/)
  })

  it('patches selected fields only', () => {
    const patched = applyOpeningProfilePatch(seed('london-fx'), { openingTime: '09:15' }, NOW)
    expect(patched.openingTime).toBe('09:15')
    expect(patched.timezone).toBe('Europe/London')
  })
})

describe('strategy + trend configuration', () => {
  it('defaults to Strategy B (all_breakouts) with Daily EMA(200)', () => {
    const profile = buildOpeningProfile(
      { displayName: 'London FX', timezone: 'Europe/London', openingTime: '08:00' },
      NOW,
    )
    expect(profile.alertMode).toBe('all_breakouts')
    expect(profile.trendEmaPeriod).toBe(200)
    expect(profile.trendTimeframe).toBe('D1')
  })

  it('accepts Strategy A (manipulation_only) and a custom trend config', () => {
    const profile = buildOpeningProfile(
      {
        displayName: 'London FX',
        timezone: 'Europe/London',
        openingTime: '08:00',
        alertMode: 'manipulation_only',
        trendEmaPeriod: 50,
        trendTimeframe: 'H4',
      },
      NOW,
    )
    expect(profile.alertMode).toBe('manipulation_only')
    expect(profile.trendEmaPeriod).toBe(50)
    expect(profile.trendTimeframe).toBe('H4')
  })

  it('rejects invalid alertMode, trendTimeframe and trendEmaPeriod', () => {
    const base = { displayName: 'X', timezone: 'Europe/London', openingTime: '08:00' }
    expect(() => buildOpeningProfile({ ...base, alertMode: 'sometimes' }, NOW)).toThrow(/alertMode/)
    expect(() => buildOpeningProfile({ ...base, trendTimeframe: 'M1' }, NOW)).toThrow(/trendTimeframe/)
    expect(() => buildOpeningProfile({ ...base, trendEmaPeriod: 0 }, NOW)).toThrow(/trendEmaPeriod/)
  })

  it('patches strategy fields while preserving the rest', () => {
    const patched = applyOpeningProfilePatch(seed('london-fx'), { alertMode: 'manipulation_only' }, NOW)
    expect(patched.alertMode).toBe('manipulation_only')
    expect(patched.trendEmaPeriod).toBe(200)
    expect(patched.timezone).toBe('Europe/London')
  })
})
