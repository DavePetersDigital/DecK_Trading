// Reusable Market Event model for ORB (and future) dashboard activity.
// Backend is the source of truth; the client only displays these records.

export type MarketEventType =
  | 'orb_high_broken'
  | 'orb_low_broken'
  | 'returned_to_orb'
  | 'm15_orb_high_confirmed'
  | 'm15_orb_low_confirmed'

export type MarketEventDirection = 'bullish' | 'bearish' | 'neutral'
export type MarketEventTimeframe = 'M5' | 'M15'
export type MarketEventManipulation = 'no' | 'normal' | 'large' | 'extreme'

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
  manipulationCategory?: MarketEventManipulation | null
  tradingWindowActive: boolean
  extendedMonitoringAllowed: boolean
  notificationEligible: boolean
  qualified: boolean
  metadata?: Record<string, unknown>
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

export function marketEventDirectionFor(eventType: MarketEventType): MarketEventDirection {
  if (eventType === 'orb_high_broken' || eventType === 'm15_orb_high_confirmed') return 'bullish'
  if (eventType === 'orb_low_broken' || eventType === 'm15_orb_low_confirmed') return 'bearish'
  return 'neutral'
}

/** Deterministic key used to prevent duplicate events for the same candle transition. */
export function marketEventDedupeKey(input: {
  instrumentId: string
  openingProfileId: string
  tradingDate: string
  timeframe: MarketEventTimeframe
  eventType: MarketEventType
  candleCloseTime: string
}): string {
  return [
    input.instrumentId,
    input.openingProfileId,
    input.tradingDate,
    input.timeframe,
    input.eventType,
    input.candleCloseTime,
  ].join('|')
}
