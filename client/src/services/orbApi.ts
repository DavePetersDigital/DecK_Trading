export type OrbMonitorPhase = 'waiting' | 'awaiting_candle' | 'monitoring' | 'no_data' | 'complete'
export type OpeningDirection = 'bullish' | 'bearish' | 'doji'
export type ManipulationClassification =
  | 'NORMAL'
  | 'ELEVATED'
  | 'LARGE'
  | 'EXTREME'
  | 'INSUFFICIENT_HISTORY'
  | 'PENDING_IMPLEMENTATION'

export interface OrbOpeningRange {
  open: number
  high: number
  low: number
  close: number
  range: number
  direction: OpeningDirection
}

export interface OrbManipulation {
  mode: 'normal' | 'gold_specific'
  manipulation: boolean | null
  classification: ManipulationClassification
  rank: number | null
  sampleCount: number
  message: string
}

export type TrendDirection = 'bullish' | 'bearish'
export type AlertMode = 'all_breakouts' | 'manipulation_only'

export interface OrbTrend {
  symbolId: string
  timeframe: string
  emaPeriod: number
  trend: TrendDirection | null
  ema: number | null
  price: number | null
  updatedAt: string
  stale: boolean
}

export type OrbZone = 'inside' | 'broken_above' | 'broken_below'

export interface CandleBreakoutSnapshot {
  direction: 'high' | 'low' | null
  zone?: OrbZone
  hadBreakout?: boolean
  candleTime: string | null
  confirmedAt: string | null
  lastProcessedCandleCloseUtc?: string | null
}

export interface OrbMonitor {
  key: string
  symbolId: string
  symbolName: string
  displayName: string
  profileId: string
  profileName: string
  manipulationMode: 'normal' | 'gold_specific'
  alertMode: AlertMode
  tradingDate: string
  openingInstantUtc: string
  openingCandleCloseUtc: string
  closingInstantUtc?: string
  tradingWindowMinutes?: number
  allowTradesAfterWindow?: boolean
  tradingWindowEndUtc?: string
  phase: OrbMonitorPhase
  openingRange: OrbOpeningRange | null
  manipulation: OrbManipulation | null
  trend: OrbTrend | null
  m5Breakout?: CandleBreakoutSnapshot | null
  m15Breakout?: CandleBreakoutSnapshot | null
  upsideAlertAt: string | null
  downsideAlertAt: string | null
  updatedAt: string
}

export type MarketEventType =
  | 'orb_high_broken'
  | 'orb_low_broken'
  | 'returned_to_orb'
  | 'm15_orb_high_confirmed'
  | 'm15_orb_low_confirmed'

export type MarketEventDirection = 'bullish' | 'bearish' | 'neutral'
export type MarketEventTimeframe = 'M5' | 'M15'

export interface MarketEvent {
  id: string
  instrumentId: string
  symbol: string
  instrumentName: string
  openingProfileId: string
  openingProfileName: string
  tradingDate: string
  eventType: MarketEventType
  timeframe: MarketEventTimeframe
  direction: MarketEventDirection
  occurredAt: string
  candleOpenTime?: string
  candleCloseTime?: string
  closePrice?: number
  orbHigh?: number
  orbLow?: number
  manipulationCategory?: 'no' | 'normal' | 'large' | 'extreme' | null
  tradingWindowActive: boolean
  extendedMonitoringAllowed: boolean
  notificationEligible: boolean
  qualified: boolean
  metadata?: Record<string, unknown>
}

export interface OrbAlert {
  id: string
  symbolId: string
  instrument: string
  displayName: string
  profileId: string
  openingProfile: string
  tradingDate: string
  event: 'ORB Breakout' | 'Returned to ORB'
  direction: 'Up' | 'Down' | 'Neutral'
  triggerPrice: number
  orbHigh: number
  orbLow: number
  openingCandleDirection: OpeningDirection
  manipulation: boolean | null
  manipulationMode: 'normal' | 'gold_specific'
  classification: ManipulationClassification
  rank: number | null
  trend: TrendDirection | null
  timeUtc: string
  message: string
  marketEventType?: MarketEventType
  timeframe?: MarketEventTimeframe
}

export interface OrbEngineState {
  running: boolean
  connected: boolean
  subscribedSymbols: string[]
  monitors: OrbMonitor[]
  events: MarketEvent[]
  alerts: OrbAlert[]
}

interface OrbStateResponse extends Partial<OrbEngineState> {
  success: boolean
  error?: string
}

export async function fetchOrbEngineState(): Promise<OrbEngineState> {
  const response = await fetch('/api/orb/state')
  let payload: OrbStateResponse
  try {
    payload = (await response.json()) as OrbStateResponse
  } catch {
    throw new Error(`Unexpected response from the ORB engine (${response.status}).`)
  }
  if (!response.ok || !payload.success) {
    throw new Error(payload.error || `Failed to load ORB engine state (${response.status}).`)
  }
  return {
    running: payload.running ?? false,
    connected: payload.connected ?? false,
    subscribedSymbols: payload.subscribedSymbols ?? [],
    monitors: payload.monitors ?? [],
    events: payload.events ?? [],
    alerts: payload.alerts ?? [],
  }
}

export const MARKET_EVENT_LABELS: Record<MarketEventType, string> = {
  orb_high_broken: 'ORB High Broken',
  orb_low_broken: 'ORB Low Broken',
  returned_to_orb: 'Returned to ORB',
  m15_orb_high_confirmed: 'M15 ORB High Confirmed',
  m15_orb_low_confirmed: 'M15 ORB Low Confirmed',
}

export function marketEventLabel(eventType: MarketEventType): string {
  return MARKET_EVENT_LABELS[eventType]
}
