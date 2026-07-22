import type { Alert, AppSettings, DailyPlan, ManipulationData, OrbData, StructureData } from '../types'

export const BASE_PRICE = 3988.6

export const defaultPlan: DailyPlan = {
  bias: 'Neutral',
  approachDistance: 3,
  entryTolerance: 0.3,
  lastSaved: null,
  levels: [
    { id: 'sell', direction: 'Sell', price: 3992, enabled: true, approachDistance: 3, entryTolerance: 0.3, alertSent: false },
    { id: 'buy1', direction: 'Buy', price: 3960, enabled: true, approachDistance: 3, entryTolerance: 0.3, alertSent: false },
    { id: 'buy2', direction: 'Buy', price: 3922, enabled: true, approachDistance: 3, entryTolerance: 0.3, alertSent: false },
  ],
}

export const defaultOrb: OrbData = {
  session: 'London', high: 3992.4, low: 3986.1, dailyAtr: 42.8,
  rangeComplete: true, state: 'Waiting for breakout',
  breakoutDirection: null, breakoutTimestamp: null,
}

export const defaultManipulation: ManipulationData = {
  session: 'London', firstCandleHigh: 3993, firstCandleLow: 3978,
  dailyAtr: 42.8, candleComplete: true, breakoutDirection: null,
  reclaimed: false, state: 'Waiting for range break',
}

export const defaultStructure: StructureData = {
  dailyBias: 'Neutral',
  dailyEma200: 3864.5,
  previousDayHigh: 4005.2,
  previousDayLow: 3968.4,
  recentSwingHigh: 4012.8,
  recentSwingLow: 3954.1,
  zones: [
    { id: 'r1', label: 'Daily supply', type: 'Resistance', timeframe: 'Daily', upperPrice: 4008, lowerPrice: 3998, enabled: true, notes: 'Previous rejection area' },
    { id: 's1', label: 'Daily demand', type: 'Support', timeframe: 'Daily', upperPrice: 3964, lowerPrice: 3956, enabled: true, notes: 'Plan confluence' },
    { id: 's2', label: '4H support', type: 'Support', timeframe: '4H', upperPrice: 3981, lowerPrice: 3976, enabled: true, notes: 'Recent base' },
  ],
}

export const defaultSettings: AppSettings = {
  theme: 'light',
  defaultApproachDistance: 3,
  sessionEnabled: { Tokyo: true, London: true, 'New York': true },
  rowHighlightMode: 'qualified',
}

export const initialAlerts: Alert[] = [
  { id: '1', time: '09:42', type: 'LEVEL', message: 'XAUUSD approaching sell level 3992', status: 'Active' },
  { id: '2', time: '09:16', type: 'SESSION', message: 'London monitoring started', status: 'Sent' },
  { id: '3', time: '08:00', type: 'SYSTEM', message: 'Daily plan loaded', status: 'Info' },
]

