export type View = 'overview' | 'gold' | 'alerts' | 'admin'
export type GoldTab = 'overview' | 'orb' | 'plan' | 'structure' | 'manipulation' | 'history'
export type Theme = 'dark' | 'slate'
export type Bias = 'Bullish' | 'Bearish' | 'Neutral'
export type Direction = 'Buy' | 'Sell'
export type InstrumentStatus =
  | 'ACTION REQUIRED' | 'APPROACHING' | 'WATCH' | 'WAITING'
  | 'SESSION CLOSED' | 'MONITORING OFF'
export type StrategyStatus =
  | 'NO ACTIVE SETUP' | 'WAITING' | 'MONITORING' | 'APPROACHING'
  | 'WATCH M1' | 'ACTION REQUIRED' | 'SESSION CLOSED' | 'MONITORING OFF'
export type LevelStatus = 'DISABLED' | 'WAITING' | 'APPROACHING' | 'IN ZONE' | 'PASSED' | 'ALERT SENT'
export type OrbState =
  | 'Waiting for session' | 'Building opening candle' | 'Opening range complete'
  | 'Waiting for breakout' | 'Breakout detected' | 'Waiting for confirmation'
  | 'Setup active' | 'Finished'
export type ManipulationState =
  | 'Waiting for first M15 candle' | 'First candle complete' | 'Manipulation not detected'
  | 'Manipulation detected' | 'Waiting for range break' | 'Waiting for reclaim'
  | 'Reclaim confirmed' | 'Watch lower timeframe' | 'Setup invalidated' | 'Session finished'

export interface PlannedLevel {
  id: string
  direction: Direction
  price: number
  enabled: boolean
  approachDistance: number
  entryTolerance: number
  alertSent: boolean
}

export interface DailyPlan {
  bias: Bias
  levels: PlannedLevel[]
  approachDistance: number
  entryTolerance: number
  lastSaved: string | null
}

export interface PriceLevel {
  id: string
  direction: Direction
  value: number
}

export interface OrbData {
  session: 'London'
  high: number
  low: number
  dailyAtr: number
  rangeComplete: boolean
  state: OrbState
  breakoutDirection: 'Up' | 'Down' | null
  breakoutTimestamp: string | null
}

export interface ManipulationData {
  session: 'London'
  firstCandleHigh: number
  firstCandleLow: number
  dailyAtr: number
  candleComplete: boolean
  breakoutDirection: 'Up' | 'Down' | null
  reclaimed: boolean
  state: ManipulationState
}

export interface StructureZone {
  id: string
  label: string
  type: 'Support' | 'Resistance'
  timeframe: 'Daily' | '4H'
  upperPrice: number
  lowerPrice: number
  enabled: boolean
  notes: string
}

export interface StructureData {
  dailyBias: Bias
  dailyEma200: number
  previousDayHigh: number
  previousDayLow: number
  recentSwingHigh: number
  recentSwingLow: number
  zones: StructureZone[]
}

export type ActivityCategory = 'PLAN' | 'LEVEL' | 'ALERT' | 'ORB' | 'MANIPULATION' | 'STRUCTURE' | 'MONITORING' | 'SYSTEM'

export interface ActivityEvent {
  id: string
  timestamp: string
  category: ActivityCategory
  event: string
  price: number | null
  status: string
}

export interface Alert {
  id: string
  time: string
  type: 'LEVEL' | 'SESSION' | 'SYSTEM' | 'TEST'
  message: string
  status: 'Sent' | 'Active' | 'Info'
}

export type AlertItem = Alert

export interface Instrument {
  symbol: string
  name: string
  price: number
  dailyChange: number
  status: InstrumentStatus
  bias: Bias
  session: string
  strategies: { name: string; status: string }[]
  nextEvent: string
}

export interface GoldState {
  price: number
  plan: DailyPlan
  monitoring: boolean
  orb: OrbData
  manipulation: ManipulationData
  structure: StructureData
  alerts: Alert[]
  history: ActivityEvent[]
  lastStatusUpdate: string
}

export interface AppSettings {
  theme: Theme
  defaultApproachDistance: number
  sessionEnabled: Record<string, boolean>
}
