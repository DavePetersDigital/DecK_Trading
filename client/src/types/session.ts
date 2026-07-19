export type SessionId = 'tokyo' | 'london' | 'newYork'
export type SessionState = 'CLOSED' | 'OPENING_SOON' | 'OPEN' | 'CLOSING_SOON'
export type SessionClassification = 'closed' | 'opening' | 'open' | 'closing'
export type CandleTimeframe = 'M1' | 'M5' | 'M15' | 'H1'

export interface SessionTime {
  hour: number
  minute: number
}

export interface SessionDefinition {
  id: SessionId
  name: string
  timeZone: string
  open: SessionTime
  close: SessionTime
}

export interface SessionConfiguration {
  sessions: Record<SessionId, SessionDefinition>
  openingSoonMinutes: number
  closingSoonMinutes: number
  candleAlertSeconds: number
  brokerUtcOffsetMinutes: number
}

export interface TradingSession {
  id: SessionId
  name: string
  state: SessionState
  openTime: string
  closeTime: string
  localTime: string
  countdownToOpen: number
  countdownToClose: number
  progressPercentage: number
  isActive: boolean
  timeRemaining: number
  classification: SessionClassification
}

export type SessionStatus = TradingSession

export interface CandleCountdown {
  timeframe: CandleTimeframe
  durationSeconds: number
  secondsRemaining: number
  minutes: number
  seconds: number
  percentageComplete: number
  finalMinute: boolean
}

export interface OverlapState {
  active: boolean
  sessions: SessionId[]
  sessionNames: string[]
  timeRemaining: number
}

export interface ClockState {
  localTime: string
  brokerTime: string
  utcTime: string
}

export interface NextSessionState {
  session: TradingSession | null
  countdown: number
}

export interface SessionSnapshot {
  now: Date
  clocks: ClockState
  sessions: Record<SessionId, TradingSession>
  activeSessions: TradingSession[]
  overlap: OverlapState
  candles: Record<CandleTimeframe, CandleCountdown>
  nextSession: NextSessionState
  configuration: SessionConfiguration
}
