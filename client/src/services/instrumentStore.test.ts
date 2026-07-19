import { describe, expect, it } from 'vitest'
import { defaultInstrumentConfigurations } from '../config/instrumentRegistry'
import {
  createDefaultInstrumentState, createInitialInstrumentStore, INSTRUMENT_STORE_KEY,
  LEGACY_GOLD_KEY, LEGACY_PLAN_KEY,
} from './instrumentStore'

function storage(entries: Record<string, string>) {
  return { getItem: (key: string) => entries[key] ?? null }
}

describe('instrument store migration', () => {
  it('migrates the complete legacy Gold state without sharing it with other instruments', () => {
    const goldConfig = defaultInstrumentConfigurations.find((config) => config.symbol === 'XAUUSD')!
    const legacy = createDefaultInstrumentState(goldConfig)
    legacy.price = 4012.34
    legacy.plan.bias = 'Bearish'
    legacy.plan.levels[0].price = 4050
    legacy.structure.zones[0].notes = 'Preserve me'
    legacy.orb.breakoutDirection = 'Down'
    legacy.manipulation.reclaimed = true
    legacy.monitoring = false
    legacy.history = [{ id: 'history-1', timestamp: '2026-01-01T00:00:00.000Z', category: 'PLAN', event: 'Saved event', price: 4012.34, status: 'Saved' }]

    const store = createInitialInstrumentStore(storage({ [LEGACY_GOLD_KEY]: JSON.stringify(legacy) }))

    expect(Object.keys(store.instruments).sort()).toEqual(['EURUSD', 'NAS100', 'USDJPY', 'XAUUSD'])
    expect(store.instruments.XAUUSD.price).toBe(4012.34)
    expect(store.instruments.XAUUSD.plan.bias).toBe('Bearish')
    expect(store.instruments.XAUUSD.plan.levels[0].price).toBe(4050)
    expect(store.instruments.XAUUSD.structure.zones[0].notes).toBe('Preserve me')
    expect(store.instruments.XAUUSD.orb.breakoutDirection).toBe('Down')
    expect(store.instruments.XAUUSD.manipulation.reclaimed).toBe(true)
    expect(store.instruments.XAUUSD.monitoring).toBe(false)
    expect(store.instruments.XAUUSD.history[0].id).toBe('history-1')
    expect(store.instruments.EURUSD.plan.levels).toEqual([])
  })

  it('prefers the versioned store on subsequent idempotent loads', () => {
    const first = createInitialInstrumentStore(storage({}))
    first.instruments.XAUUSD.price = 4100
    const conflictingLegacy = { ...first.instruments.XAUUSD, price: 3900 }

    const second = createInitialInstrumentStore(storage({
      [INSTRUMENT_STORE_KEY]: JSON.stringify(first),
      [LEGACY_GOLD_KEY]: JSON.stringify(conflictingLegacy),
    }))

    expect(second.instruments.XAUUSD.price).toBe(4100)
  })

  it('recovers from malformed storage and still creates the clean default registry', () => {
    const store = createInitialInstrumentStore(storage({
      [INSTRUMENT_STORE_KEY]: '{bad json',
      [LEGACY_GOLD_KEY]: '[]',
      [LEGACY_PLAN_KEY]: '{"levels":"invalid"}',
    }))

    expect(Object.keys(store.instruments)).toHaveLength(4)
    expect(store.instruments.XAUUSD.config.displayName).toBe('Gold / U.S. Dollar')
    expect(store.instruments.EURUSD.config.priceDecimals).toBe(5)
  })

  it('normalizes incomplete imported custom instruments instead of crashing', () => {
    const store = createInitialInstrumentStore(storage({
      [INSTRUMENT_STORE_KEY]: JSON.stringify({
        version: 1,
        instruments: {
          OILUSD: { config: { symbol: 'oilusd', displayName: 'Oil' }, price: 'invalid', plan: null },
        },
      }),
    }))

    expect(store.instruments.OILUSD.config.symbol).toBe('OILUSD')
    expect(store.instruments.OILUSD.config.category).toBe('Other')
    expect(store.instruments.OILUSD.config.priceStep).toBeGreaterThan(0)
    expect(store.instruments.OILUSD.plan.levels).toEqual([])
  })
})
