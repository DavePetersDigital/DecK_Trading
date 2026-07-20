import type { InstrumentStatus } from '../types'
import type {
  AlertReadyInstrumentState, InstrumentPriorityInput, InstrumentPriorityResult,
  PriorityFilter, PriorityGroups, PrioritySignal,
} from '../types/instrumentPriority'
import { formatCandleDuration, formatSessionDuration } from '../services/sessionEngine'

const baseScores: Record<PrioritySignal, number> = {
  ACTION_REQUIRED: 100,
  WATCH_M5: 95,
  IN_ENTRY_ZONE: 90,
  APPROACHING: 75,
  BREAKOUT_DETECTED: 70,
  RECLAIM_CONFIRMED: 70,
  WATCH: 50,
  MONITORING: 35,
  WAITING: 15,
  SESSION_CLOSED: 5,
  MONITORING_OFF: 0,
}

export const priorityGroupOrder: InstrumentStatus[] = [
  'ACTION REQUIRED',
  'APPROACHING',
  'WATCH',
  'WAITING',
  'SESSION CLOSED',
  'MONITORING OFF',
]

function statusForSignal(signal: PrioritySignal): InstrumentStatus {
  if (signal === 'ACTION_REQUIRED' || signal === 'WATCH_M5' || signal === 'IN_ENTRY_ZONE') return 'ACTION REQUIRED'
  if (signal === 'APPROACHING') return 'APPROACHING'
  if (signal === 'BREAKOUT_DETECTED' || signal === 'RECLAIM_CONFIRMED' || signal === 'WATCH') return 'WATCH'
  if (signal === 'MONITORING_OFF') return 'MONITORING OFF'
  if (signal === 'SESSION_CLOSED') return 'SESSION CLOSED'
  return 'WAITING'
}

function triggerDescription(input: InstrumentPriorityInput) {
  if (input.triggerLevel === null) return 'the active setup'
  const direction = input.triggerDirection?.toLowerCase() ?? 'trigger'
  return `${direction} level ${input.triggerLevel.toFixed(input.definition.precision)}`
}

function operationalMessage(input: InstrumentPriorityInput): Pick<InstrumentPriorityResult, 'reason' | 'nextAction'> {
  const trigger = triggerDescription(input)
  const distance = input.distance === null ? '' : ` (${input.distance.toFixed(input.definition.precision)} away)`
  const candle = `${input.relevantCandle} closes in ${formatCandleDuration(input.candle)}`

  if (input.signal === 'MONITORING_OFF') {
    return { reason: 'Monitoring is disabled for this instrument.', nextAction: 'PAUSED — Enable monitoring to resume alerts.' }
  }
  if (input.signal === 'SESSION_CLOSED') {
    return {
      reason: `No new setup is active. ${input.session.name} opens in ${formatSessionDuration(input.session.countdownToOpen)}.`,
      nextAction: `SESSION CLOSED — Continue monitoring until ${input.session.name} opens.`,
    }
  }
  if (input.signal === 'ACTION_REQUIRED' || input.signal === 'WATCH_M5' || input.signal === 'IN_ENTRY_ZONE') {
    return {
      reason: `Price is inside ${trigger}${distance}.`,
      nextAction: `WATCH M5 — Look for ${input.triggerDirection === 'Sell' ? 'bearish' : 'bullish'} confirmation.`,
    }
  }
  if (input.signal === 'APPROACHING') {
    return {
      reason: `Price is approaching ${trigger}${distance}.`,
      nextAction: `PREPARE — Be ready to open the ${input.relevantCandle} chart.`,
    }
  }
  if (input.signal === 'BREAKOUT_DETECTED') {
    return {
      reason: `Breakout detected while ${input.session.name} is ${input.session.state.replace('_', ' ').toLowerCase()}.`,
      nextAction: `WAITING FOR CONFIRMATION — ${candle}.`,
    }
  }
  if (input.signal === 'RECLAIM_CONFIRMED') {
    return {
      reason: 'Manipulation reclaim is confirmed.',
      nextAction: 'RECLAIM WATCH — Watch the lower timeframe for entry confirmation.',
    }
  }
  if (input.signal === 'WATCH') {
    return { reason: 'A strategy condition is active.', nextAction: `WATCH — ${candle}.` }
  }
  if (input.signal === 'MONITORING' && input.session.isActive && !input.orbComplete) {
    return {
      reason: `${input.session.name} has opened and the opening range is building.`,
      nextAction: `ORB BUILDING — ${candle}.`,
    }
  }
  if (input.signal === 'MONITORING' && input.orbComplete) {
    return {
      reason: 'The opening range is complete and price remains inside the range.',
      nextAction: 'WAITING FOR BREAKOUT — No chart action is required.',
    }
  }
  return {
    reason: 'No active setup. Continue monitoring.',
    nextAction: 'WAIT — No chart action is required.',
  }
}

export function calculateInstrumentPriority(input: InstrumentPriorityInput): InstrumentPriorityResult {
  const status = statusForSignal(input.signal)
  let score = baseScores[input.signal]

  if (input.session.isActive) score += 4
  else if (input.session.state === 'OPENING_SOON') score += 2
  if (input.orbComplete) score += 2
  if (input.breakoutDetected) score += 3
  if (input.manipulationDetected) score += 2
  if (input.reclaimConfirmed) score += 4
  if (input.alertAlreadySent) score -= 1
  if (input.distanceToApproachRatio !== null) {
    score += Math.max(0, Math.round((1 - Math.min(input.distanceToApproachRatio, 1)) * 5))
  }
  if (!input.monitoring) score = 0

  return { score: Math.max(0, score), status, ...operationalMessage(input) }
}

export function toAlertReadyInstrumentState(input: InstrumentPriorityInput): AlertReadyInstrumentState {
  return {
    ...calculateInstrumentPriority(input),
    instrument: input.definition,
    price: input.price,
    dailyChange: input.dailyChange,
    bias: input.bias,
    monitoring: input.monitoring,
    signal: input.signal,
    triggerLevel: input.triggerLevel,
    triggerDirection: input.triggerDirection,
    distance: input.distance,
    session: input.session,
    relevantCandle: input.candle,
    strategies: input.strategies,
    timestamp: input.timestamp,
    alertAlreadySent: input.alertAlreadySent,
    alertStatus: input.alertAlreadySent ? 'SENT' : 'NOT_SENT',
  }
}

export function sortInstrumentQueue(instruments: AlertReadyInstrumentState[]) {
  return [...instruments].sort((left, right) => {
    const groupDifference = priorityGroupOrder.indexOf(left.status) - priorityGroupOrder.indexOf(right.status)
    if (groupDifference !== 0) return groupDifference
    if (right.score !== left.score) return right.score - left.score
    return left.instrument.symbol.localeCompare(right.instrument.symbol)
  })
}

export function groupInstrumentQueue(instruments: AlertReadyInstrumentState[]): PriorityGroups {
  const groups: PriorityGroups = {
    'ACTION REQUIRED': [],
    APPROACHING: [],
    WATCH: [],
    WAITING: [],
    'SESSION CLOSED': [],
    'MONITORING OFF': [],
  }
  sortInstrumentQueue(instruments).forEach((instrument) => groups[instrument.status].push(instrument))
  return groups
}

export function matchesPriorityFilter(instrument: AlertReadyInstrumentState, filter: PriorityFilter) {
  if (filter === 'ALL') return true
  if (filter === 'ACTIVE') return ['ACTION REQUIRED', 'APPROACHING', 'WATCH'].includes(instrument.status)
  if (filter === 'ACTION_REQUIRED') return instrument.status === 'ACTION REQUIRED'
  if (filter === 'SESSION_CLOSED') return instrument.status === 'SESSION CLOSED'
  if (filter === 'MONITORING_OFF') return instrument.status === 'MONITORING OFF'
  return instrument.status === filter
}
