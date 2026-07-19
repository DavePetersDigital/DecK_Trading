import type {
  InstrumentCategory, InstrumentConfiguration, InstrumentStrategies,
} from '../types'

const CREATED_AT = '2026-01-01T00:00:00.000Z'
const allSessions: InstrumentConfiguration['monitoredSessions'] = ['tokyo', 'london', 'newYork']
const allStrategies: InstrumentStrategies = {
  dailyPlan: true,
  orb: true,
  structure: true,
  manipulation: true,
}

export const categoryDefaults: Record<InstrumentCategory, Pick<
  InstrumentConfiguration,
  'priceDecimals' | 'pipSize' | 'pointSize' | 'priceStep' | 'defaultApproachDistance' | 'defaultEntryTolerance' | 'monitoredSessions' | 'strategySessions'
>> = {
  Metal: { priceDecimals: 2, pipSize: 0.01, pointSize: 0.01, priceStep: 0.1, defaultApproachDistance: 3, defaultEntryTolerance: 0.3, monitoredSessions: allSessions, strategySessions: { orb: ['london'], manipulation: ['london'] } },
  Forex: { priceDecimals: 5, pipSize: 0.0001, pointSize: 0.00001, priceStep: 0.0001, defaultApproachDistance: 0.002, defaultEntryTolerance: 0.0002, monitoredSessions: ['london'], strategySessions: { orb: ['london'], manipulation: ['london'] } },
  Index: { priceDecimals: 1, pipSize: 1, pointSize: 1, priceStep: 1, defaultApproachDistance: 20, defaultEntryTolerance: 2, monitoredSessions: ['newYork'], strategySessions: { orb: ['newYork'], manipulation: ['newYork'] } },
  Energy: { priceDecimals: 2, pipSize: 0.01, pointSize: 0.01, priceStep: 0.01, defaultApproachDistance: 0.5, defaultEntryTolerance: 0.05, monitoredSessions: ['newYork'], strategySessions: { orb: ['newYork'], manipulation: ['newYork'] } },
  Crypto: { priceDecimals: 2, pipSize: 1, pointSize: 0.01, priceStep: 1, defaultApproachDistance: 200, defaultEntryTolerance: 20, monitoredSessions: allSessions, strategySessions: { orb: ['newYork'], manipulation: ['newYork'] } },
  Other: { priceDecimals: 2, pipSize: 0.01, pointSize: 0.01, priceStep: 0.01, defaultApproachDistance: 1, defaultEntryTolerance: 0.1, monitoredSessions: ['london'], strategySessions: { orb: ['london'], manipulation: ['london'] } },
}

function config(
  values: Omit<InstrumentConfiguration, 'id' | 'createdAt' | 'updatedAt' | 'sessionConfiguration' | 'ctraderSymbolId' | 'ctraderSymbolName'> &
    Partial<Pick<InstrumentConfiguration, 'createdAt' | 'updatedAt' | 'sessionConfiguration' | 'ctraderSymbolId' | 'ctraderSymbolName'>>,
): InstrumentConfiguration {
  return {
    ...values,
    id: values.symbol.toLowerCase(),
    monitoredSessions: [...values.monitoredSessions],
    strategySessions: {
      orb: [...values.strategySessions.orb],
      manipulation: [...values.strategySessions.manipulation],
    },
    sessionConfiguration: values.sessionConfiguration ?? { openingSoonMinutes: 30, closingSoonMinutes: 30 },
    ctraderSymbolId: values.ctraderSymbolId,
    ctraderSymbolName: values.ctraderSymbolName ?? '',
    createdAt: values.createdAt ?? CREATED_AT,
    updatedAt: values.updatedAt ?? CREATED_AT,
  }
}

export const defaultInstrumentConfigurations: InstrumentConfiguration[] = [
  config({
    symbol: 'XAUUSD', displayName: 'Gold / U.S. Dollar', shortName: 'Gold', iconText: 'Au',
    category: 'Metal', enabled: true, workspaceEnabled: true, monitoredSessions: allSessions,
    strategySessions: { orb: ['london'], manipulation: ['london'] },
    priceDecimals: 2, pipSize: 0.01, pointSize: 0.01, priceStep: 0.1,
    defaultApproachDistance: 3, defaultEntryTolerance: 0.3, strategies: allStrategies,
  }),
  config({
    symbol: 'USDJPY', displayName: 'U.S. Dollar / Japanese Yen', shortName: 'Dollar Yen',
    category: 'Forex', enabled: true, workspaceEnabled: true, monitoredSessions: ['tokyo'],
    strategySessions: { orb: ['tokyo'], manipulation: ['tokyo'] },
    priceDecimals: 3, pipSize: 0.01, pointSize: 0.001, priceStep: 0.001,
    defaultApproachDistance: 0.2, defaultEntryTolerance: 0.02,
    strategies: { dailyPlan: true, orb: false, structure: true, manipulation: false },
  }),
  config({
    symbol: 'EURUSD', displayName: 'Euro / U.S. Dollar', shortName: 'Euro',
    category: 'Forex', enabled: true, workspaceEnabled: true, monitoredSessions: ['london'],
    strategySessions: { orb: ['london'], manipulation: ['london'] },
    priceDecimals: 5, pipSize: 0.0001, pointSize: 0.00001, priceStep: 0.00001,
    defaultApproachDistance: 0.002, defaultEntryTolerance: 0.0002,
    strategies: { dailyPlan: true, orb: true, structure: true, manipulation: false },
  }),
  config({
    symbol: 'NAS100', displayName: 'Nasdaq 100', shortName: 'Nasdaq',
    category: 'Index', enabled: true, workspaceEnabled: true, monitoredSessions: ['newYork'],
    strategySessions: { orb: ['newYork'], manipulation: ['newYork'] },
    priceDecimals: 1, pipSize: 1, pointSize: 1, priceStep: 0.1,
    defaultApproachDistance: 20, defaultEntryTolerance: 2,
    strategies: { dailyPlan: true, orb: true, structure: true, manipulation: false },
  }),
]

export function createInstrumentConfiguration(
  values: Pick<InstrumentConfiguration, 'symbol' | 'displayName' | 'shortName' | 'category'> &
    Partial<InstrumentConfiguration>,
): InstrumentConfiguration {
  const symbol = values.symbol.trim().toUpperCase()
  const defaults = categoryDefaults[values.category]
  const now = new Date().toISOString()
  return config({
    ...defaults,
    ...values,
    symbol,
    displayName: values.displayName.trim(),
    shortName: values.shortName.trim(),
    enabled: values.enabled ?? true,
    workspaceEnabled: values.workspaceEnabled ?? true,
    strategies: values.strategies ?? { dailyPlan: true, orb: false, structure: true, manipulation: false },
    createdAt: values.createdAt ?? now,
    updatedAt: now,
  })
}
