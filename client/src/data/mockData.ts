import type { Alert, AppSettings, DailyPlan, Instrument, ManipulationData, OrbData, StructureData } from '../types'

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
  theme: 'dark',
  defaultApproachDistance: 3,
  sessionEnabled: { Tokyo: true, London: true, 'New York': true },
}

export const initialAlerts: Alert[] = [
  { id: '1', time: '09:42', type: 'LEVEL', message: 'XAUUSD approaching sell level 3992', status: 'Active' },
  { id: '2', time: '09:16', type: 'SESSION', message: 'London monitoring started', status: 'Sent' },
  { id: '3', time: '08:00', type: 'SYSTEM', message: 'Daily plan loaded', status: 'Info' },
]

export const otherInstruments: Omit<Instrument, 'status'>[] = [
  {
    symbol: 'USDJPY', name: 'U.S. Dollar / Japanese Yen', price: 149.84, dailyChange: -0.18,
    bias: 'Bearish', session: 'Tokyo Closed',
    strategies: [{ name: 'Daily Plan', status: 'Waiting' }, { name: 'Session Levels', status: 'No active setup' }],
    nextEvent: 'London opens in 42 minutes',
  },
  {
    symbol: 'EURUSD', name: 'Euro / U.S. Dollar', price: 1.0864, dailyChange: 0.12,
    bias: 'Bullish', session: 'London Open',
    strategies: [{ name: 'Daily Plan', status: 'Watch pullback' }, { name: 'ORB', status: 'Range building' }],
    nextEvent: 'Watch support at 1.0840 — 0.0024 away',
  },
  {
    symbol: 'NAS100', name: 'Nasdaq 100', price: 21842.6, dailyChange: 0.46,
    bias: 'Bullish', session: 'New York Closed',
    strategies: [{ name: 'Daily Plan', status: 'Waiting' }, { name: 'Opening Drive', status: 'Session closed' }],
    nextEvent: 'New York opens in 1h 42m',
  },
]

export const sessions = [
  { name: 'Tokyo', state: 'Closed', time: '09:00 – 18:00 JST', countdown: 'Opens in 05:18', tone: 'closed' },
  { name: 'London', state: 'Open', time: '08:00 – 16:30 BST', countdown: 'Closes in 02:12', tone: 'open' },
  { name: 'New York', state: 'Closed', time: '08:00 – 17:00 EDT', countdown: 'Opens in 01:42', tone: 'closed' },
] as const
