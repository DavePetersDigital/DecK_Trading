import type { Bias, Direction, InstrumentStatus } from './index'
import type { CandleCountdown, CandleTimeframe, SessionId, TradingSession } from './session'

export type PrioritySignal =
  | 'ACTION_REQUIRED'
  | 'WATCH_M5'
  | 'IN_ENTRY_ZONE'
  | 'APPROACHING'
  | 'BREAKOUT_DETECTED'
  | 'RECLAIM_CONFIRMED'
  | 'WATCH'
  | 'MONITORING'
  | 'WAITING'
  | 'SESSION_CLOSED'
  | 'MONITORING_OFF'

export type PriorityFilter =
  | 'ALL'
  | 'ACTIVE'
  | 'ACTION_REQUIRED'
  | 'APPROACHING'
  | 'WATCH'
  | 'WAITING'
  | 'SESSION_CLOSED'
  | 'MONITORING_OFF'

export type AlertDeliveryStatus = 'NOT_SENT' | 'SENT' | 'ACKNOWLEDGED' | 'SUPPRESSED'

export interface InstrumentDefinition {
  id: string
  symbol: string
  name: string
  precision: number
  primarySessionId: SessionId
  strategies: string[]
  workspace: string | null
}

export interface InstrumentStrategyState {
  id: string
  name: string
  status: string
  active: boolean
}

export interface InstrumentPriorityInput {
  definition: InstrumentDefinition
  price: number
  dailyChange: number
  bias: Bias
  monitoring: boolean
  signal: PrioritySignal
  session: TradingSession
  strategies: InstrumentStrategyState[]
  triggerLevel: number | null
  triggerDirection: Direction | null
  distance: number | null
  distanceToApproachRatio: number | null
  orbComplete: boolean
  breakoutDetected: boolean
  manipulationDetected: boolean
  reclaimConfirmed: boolean
  alertAlreadySent: boolean
  relevantCandle: CandleTimeframe
  candle: CandleCountdown
  timestamp: string
}

export interface InstrumentPriorityResult {
  score: number
  status: InstrumentStatus
  reason: string
  nextAction: string
}

export interface AlertReadyInstrumentState extends InstrumentPriorityResult {
  instrument: InstrumentDefinition
  price: number
  dailyChange: number
  bias: Bias
  monitoring: boolean
  signal: PrioritySignal
  triggerLevel: number | null
  triggerDirection: Direction | null
  distance: number | null
  session: TradingSession
  relevantCandle: CandleCountdown
  strategies: InstrumentStrategyState[]
  timestamp: string
  alertAlreadySent: boolean
  alertStatus: AlertDeliveryStatus
}

export type PriorityGroups = Record<InstrumentStatus, AlertReadyInstrumentState[]>
