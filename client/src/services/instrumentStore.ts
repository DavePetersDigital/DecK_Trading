import { createInstrumentConfiguration, defaultInstrumentConfigurations } from '../config/instrumentRegistry'
import {
  BASE_PRICE, defaultManipulation, defaultOrb, defaultPlan, defaultStructure, initialAlerts,
} from '../data/mockData'
import type {
  GoldState, InstrumentConfiguration, InstrumentStoreState, InstrumentWorkspaceState,
} from '../types'
import { migratePlan } from '../utils/trading'

export const INSTRUMENT_STORE_KEY = 'deck.instrumentStore.v1'
export const LEGACY_GOLD_KEY = 'deck-gold-state-v2'
export const LEGACY_PLAN_KEY = 'dp-plan'

const defaultPrices: Record<string, { price: number; dailyChange: number }> = {
  XAUUSD: { price: BASE_PRICE, dailyChange: 0.11 },
  USDJPY: { price: 149.84, dailyChange: -0.18 },
  EURUSD: { price: 1.0864, dailyChange: 0.12 },
  NAS100: { price: 21842.6, dailyChange: 0.46 },
}

const sessionName = (session: InstrumentConfiguration['preferredSession']) =>
  session === 'newYork' ? 'New York' : session[0].toUpperCase() + session.slice(1)

export function createDefaultInstrumentState(config: InstrumentConfiguration): InstrumentWorkspaceState {
  const quote = defaultPrices[config.symbol] ?? { price: 100, dailyChange: 0 }
  const price = quote.price
  const approach = config.defaultApproachDistance
  const tolerance = config.defaultEntryTolerance
  const plan = config.symbol === 'XAUUSD'
    ? structuredClone(defaultPlan)
    : { bias: 'Neutral' as const, levels: [], approachDistance: approach, entryTolerance: tolerance, lastSaved: null }
  const orb = config.symbol === 'XAUUSD'
    ? structuredClone(defaultOrb)
    : {
      ...structuredClone(defaultOrb),
      session: sessionName(config.preferredSession),
      high: price + approach,
      low: price - approach,
      dailyAtr: Math.max(approach * 10, config.pointSize),
      rangeComplete: false,
      state: 'Waiting for session' as const,
      breakoutDirection: null,
      breakoutTimestamp: null,
    }
  const manipulation = config.symbol === 'XAUUSD'
    ? structuredClone(defaultManipulation)
    : {
      ...structuredClone(defaultManipulation),
      session: sessionName(config.preferredSession),
      firstCandleHigh: price + approach,
      firstCandleLow: price - approach,
      dailyAtr: Math.max(approach * 10, config.pointSize),
      candleComplete: false,
      breakoutDirection: null,
      reclaimed: false,
      state: 'Waiting for first M15 candle' as const,
    }
  const structure = config.symbol === 'XAUUSD'
    ? structuredClone(defaultStructure)
    : {
      dailyBias: 'Neutral' as const,
      dailyEma200: price,
      previousDayHigh: price + approach * 2,
      previousDayLow: price - approach * 2,
      recentSwingHigh: price + approach,
      recentSwingLow: price - approach,
      zones: [],
    }

  return {
    config,
    price,
    dailyChange: quote.dailyChange,
    dataSourceStatus: 'Mock',
    plan,
    monitoring: true,
    orb,
    manipulation,
    structure,
    alerts: config.symbol === 'XAUUSD' ? structuredClone(initialAlerts) : [],
    history: [],
    lastStatusUpdate: new Date().toISOString(),
  }
}

function normalizeConfiguration(raw: unknown, fallback: InstrumentConfiguration): InstrumentConfiguration {
  if (!raw || typeof raw !== 'object') return fallback
  const value = raw as Partial<InstrumentConfiguration>
  const number = (candidate: unknown, fallbackValue: number, allowZero = false) =>
    Number.isFinite(Number(candidate)) && (allowZero ? Number(candidate) >= 0 : Number(candidate) > 0)
      ? Number(candidate)
      : fallbackValue
  return {
    ...fallback,
    ...value,
    id: fallback.id,
    symbol: typeof value.symbol === 'string' ? value.symbol.toUpperCase() : fallback.symbol,
    displayName: typeof value.displayName === 'string' && value.displayName ? value.displayName : fallback.displayName,
    shortName: typeof value.shortName === 'string' && value.shortName ? value.shortName : fallback.shortName,
    category: ['Metal', 'Forex', 'Index', 'Energy', 'Crypto', 'Other'].includes(String(value.category))
      ? value.category as InstrumentConfiguration['category']
      : fallback.category,
    enabled: typeof value.enabled === 'boolean' ? value.enabled : fallback.enabled,
    workspaceEnabled: typeof value.workspaceEnabled === 'boolean' ? value.workspaceEnabled : fallback.workspaceEnabled,
    preferredSession: value.preferredSession === 'tokyo' || value.preferredSession === 'london' || value.preferredSession === 'newYork'
      ? value.preferredSession
      : fallback.preferredSession,
    priceDecimals: Number.isInteger(value.priceDecimals) && Number(value.priceDecimals) >= 0 && Number(value.priceDecimals) <= 8
      ? Number(value.priceDecimals)
      : fallback.priceDecimals,
    pipSize: number(value.pipSize, fallback.pipSize),
    pointSize: number(value.pointSize, fallback.pointSize),
    priceStep: number(value.priceStep, fallback.priceStep),
    defaultApproachDistance: number(value.defaultApproachDistance, fallback.defaultApproachDistance, true),
    defaultEntryTolerance: number(value.defaultEntryTolerance, fallback.defaultEntryTolerance, true),
    strategies: { ...fallback.strategies, ...value.strategies },
    sessionConfiguration: { ...fallback.sessionConfiguration, ...value.sessionConfiguration },
  }
}

export function migrateInstrumentState(
  config: InstrumentConfiguration,
  raw: unknown,
): InstrumentWorkspaceState {
  const fallback = createDefaultInstrumentState(config)
  if (!raw || typeof raw !== 'object') return fallback
  const value = raw as Partial<InstrumentWorkspaceState> & Partial<GoldState>
  return {
    ...fallback,
    ...value,
    config: normalizeConfiguration(value.config, config),
    price: Number.isFinite(Number(value.price)) ? Number(value.price) : fallback.price,
    dailyChange: Number.isFinite(Number(value.dailyChange)) ? Number(value.dailyChange) : fallback.dailyChange,
    dataSourceStatus: value.dataSourceStatus === 'Live' || value.dataSourceStatus === 'Disconnected' ? value.dataSourceStatus : 'Mock',
    plan: value.plan && typeof value.plan === 'object' ? migratePlan(value.plan) : fallback.plan,
    orb: { ...fallback.orb, ...(value.orb && typeof value.orb === 'object' ? value.orb : {}) },
    manipulation: { ...fallback.manipulation, ...(value.manipulation && typeof value.manipulation === 'object' ? value.manipulation : {}) },
    structure: {
      ...fallback.structure,
      ...(value.structure && typeof value.structure === 'object' ? value.structure : {}),
      zones: Array.isArray(value.structure?.zones) ? value.structure.zones : fallback.structure.zones,
    },
    alerts: Array.isArray(value.alerts) ? value.alerts : fallback.alerts,
    history: Array.isArray(value.history) ? value.history : fallback.history,
  }
}

function parseJson(value: string | null) {
  if (!value) return null
  try { return JSON.parse(value) as unknown }
  catch { return null }
}

export function createInitialInstrumentStore(storage: Pick<Storage, 'getItem'>): InstrumentStoreState {
  const saved = parseJson(storage.getItem(INSTRUMENT_STORE_KEY))
  const legacyGold = parseJson(storage.getItem(LEGACY_GOLD_KEY))
  const legacyPlan = parseJson(storage.getItem(LEGACY_PLAN_KEY))
  const savedInstruments = saved && typeof saved === 'object' && 'instruments' in saved
    ? (saved as Partial<InstrumentStoreState>).instruments
    : undefined
  const instruments: Record<string, InstrumentWorkspaceState> = {}

  if (savedInstruments && typeof savedInstruments === 'object') {
    Object.entries(savedInstruments).forEach(([symbol, raw]) => {
      if (!raw || typeof raw !== 'object') return
      const rawConfig = (raw as Partial<InstrumentWorkspaceState>).config
      const defaultConfig = defaultInstrumentConfigurations.find((item) => item.symbol === symbol.toUpperCase())
      if (!defaultConfig && (!rawConfig || typeof rawConfig.symbol !== 'string')) return
      const customFallback = !defaultConfig && rawConfig
        ? createInstrumentConfiguration({
          symbol: rawConfig.symbol,
          displayName: typeof rawConfig.displayName === 'string' ? rawConfig.displayName : rawConfig.symbol,
          shortName: typeof rawConfig.shortName === 'string' ? rawConfig.shortName : rawConfig.symbol,
          category: ['Metal', 'Forex', 'Index', 'Energy', 'Crypto', 'Other'].includes(String(rawConfig.category))
            ? rawConfig.category as InstrumentConfiguration['category']
            : 'Other',
        })
        : undefined
      const config = normalizeConfiguration(rawConfig, defaultConfig ?? customFallback!)
      instruments[config.symbol] = migrateInstrumentState(config, raw)
    })
  }

  defaultInstrumentConfigurations.forEach((config) => {
    if (instruments[config.symbol]) return
    if (config.symbol === 'XAUUSD' && legacyGold) {
      instruments.XAUUSD = migrateInstrumentState(config, legacyGold)
    } else {
      const state = createDefaultInstrumentState(config)
      if (config.symbol === 'XAUUSD' && legacyPlan) state.plan = migratePlan(legacyPlan)
      instruments[config.symbol] = state
    }
  })

  return {
    version: 1,
    instruments,
    adminHistory: saved && typeof saved === 'object' && Array.isArray((saved as Partial<InstrumentStoreState>).adminHistory)
      ? (saved as Partial<InstrumentStoreState>).adminHistory!
      : [],
  }
}

export function serializeInstrumentStore(store: InstrumentStoreState) {
  return JSON.stringify(store)
}
