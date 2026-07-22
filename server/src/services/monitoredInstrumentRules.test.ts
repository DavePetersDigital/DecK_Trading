import { describe, expect, it } from 'vitest'
import {
  applyMonitoredInstrumentPatch,
  buildMonitoredInstrument,
  enabledSessionKeys,
  hasEnabledSession,
  MonitoredInstrumentValidationError,
  normalizeManipulationMode,
  normalizeSessions,
  normalizeStoredInstrument,
} from './monitoredInstrumentRules'

const NOW = '2026-07-21T00:00:00.000Z'

describe('normalizeManipulationMode', () => {
  it('keeps gold_specific only for XAUUSD', () => {
    expect(normalizeManipulationMode('XAUUSD', 'gold_specific')).toBe('gold_specific')
  })

  it('normalises gold_specific to normal for other instruments', () => {
    expect(normalizeManipulationMode('EURUSD', 'gold_specific')).toBe('normal')
  })

  it('defaults to normal when unset', () => {
    expect(normalizeManipulationMode('XAUUSD', undefined)).toBe('normal')
    expect(normalizeManipulationMode('EURUSD', null)).toBe('normal')
  })

  it('rejects unknown modes', () => {
    expect(() => normalizeManipulationMode('XAUUSD', 'aggressive')).toThrow(MonitoredInstrumentValidationError)
  })
})

describe('normalizeSessions', () => {
  it('coerces to the fixed asia/london/newYork shape', () => {
    expect(normalizeSessions({ asia: true, extra: true })).toEqual({ asia: true, london: false, newYork: false })
  })

  it('rejects non-object session payloads', () => {
    expect(() => normalizeSessions(['asia'])).toThrow(MonitoredInstrumentValidationError)
  })

  it('reports enabled sessions', () => {
    const sessions = { asia: false, london: true, newYork: true }
    expect(hasEnabledSession(sessions)).toBe(true)
    expect(enabledSessionKeys(sessions)).toEqual(['london', 'newYork'])
    expect(hasEnabledSession({ asia: false, london: false, newYork: false })).toBe(false)
  })
})

describe('buildMonitoredInstrument', () => {
  it('builds a normalised record with locked timeframes', () => {
    const instrument = buildMonitoredInstrument(
      { symbolId: '41', symbolName: 'xauusd', displayName: 'Gold', manipulationMode: 'gold_specific' },
      NOW,
    )
    expect(instrument.symbolId).toBe('41')
    expect(instrument.symbolName).toBe('XAUUSD')
    expect(instrument.entryTimeframe).toBe('M5')
    expect(instrument.orbTimeframe).toBe('M15')
    expect(instrument.manipulationMode).toBe('gold_specific')
    expect(instrument.sessions).toEqual({ asia: true, london: true, newYork: true })
  })

  it('rejects a numeric-invalid symbol id', () => {
    expect(() => buildMonitoredInstrument({ symbolId: 'abc', symbolName: 'XAUUSD' }, NOW))
      .toThrow(MonitoredInstrumentValidationError)
  })

  it('rejects an enabled instrument with no sessions', () => {
    expect(() => buildMonitoredInstrument(
      { symbolId: '5', symbolName: 'EURUSD', enabled: true, sessions: { asia: false, london: false, newYork: false } },
      NOW,
    )).toThrow(/at least one session/)
  })

  it('rejects a non-M15 orb timeframe', () => {
    expect(() => buildMonitoredInstrument(
      { symbolId: '5', symbolName: 'EURUSD', orbTimeframe: 'M5' },
      NOW,
    )).toThrow(/orbTimeframe/)
  })
})

describe('applyMonitoredInstrumentPatch', () => {
  const base = buildMonitoredInstrument({ symbolId: '5', symbolName: 'EURUSD' }, NOW)

  it('normalises gold_specific back to normal on non-gold instruments', () => {
    const patched = applyMonitoredInstrumentPatch(base, { manipulationMode: 'gold_specific' }, NOW)
    expect(patched.manipulationMode).toBe('normal')
  })

  it('prevents disabling every session while enabled', () => {
    expect(() => applyMonitoredInstrumentPatch(
      base,
      { sessions: { asia: false, london: false, newYork: false } },
      NOW,
    )).toThrow(/at least one session/)
  })

  it('allows all sessions off when the instrument is disabled', () => {
    const patched = applyMonitoredInstrumentPatch(
      base,
      { enabled: false, sessions: { asia: false, london: false, newYork: false } },
      NOW,
    )
    expect(patched.enabled).toBe(false)
  })
})

describe('normalizeStoredInstrument', () => {
  it('returns null for invalid records', () => {
    expect(normalizeStoredInstrument(null, NOW)).toBeNull()
    expect(normalizeStoredInstrument({ symbolId: 'x' }, NOW)).toBeNull()
  })

  it('repairs a partial stored record', () => {
    const instrument = normalizeStoredInstrument({ symbolId: '41', symbolName: 'XAUUSD' }, NOW)
    expect(instrument?.entryTimeframe).toBe('M5')
    expect(instrument?.manipulationMode).toBe('normal')
  })
})
