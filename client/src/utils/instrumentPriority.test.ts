import { describe, expect, it } from 'vitest'
import type { InstrumentPriorityInput, PrioritySignal } from '../types/instrumentPriority'
import type { TradingSession } from '../types/session'
import {
  calculateInstrumentPriority, groupInstrumentQueue, matchesPriorityFilter,
  sortInstrumentQueue, toAlertReadyInstrumentState,
} from './instrumentPriority'

const activeSession: TradingSession = {
  id: 'london',
  name: 'London',
  state: 'OPEN',
  openTime: '08:00',
  closeTime: '17:00',
  localTime: '12:00:00',
  countdownToOpen: 0,
  countdownToClose: 18_000,
  progressPercentage: 44,
  isActive: true,
  timeRemaining: 18_000,
  classification: 'open',
}

function input(symbol: string, signal: PrioritySignal): InstrumentPriorityInput {
  return {
    definition: {
      id: symbol.toLowerCase(),
      symbol,
      name: `${symbol} market`,
      precision: 2,
      primarySessionId: 'london',
      strategies: ['Daily Plan'],
      workspace: null,
    },
    price: 100,
    dailyChange: 0,
    bias: 'Neutral',
    monitoring: signal !== 'MONITORING_OFF',
    signal,
    session: activeSession,
    strategies: [{ id: 'plan', name: 'Daily Plan', status: 'Waiting', active: false }],
    triggerLevel: 101,
    triggerDirection: 'Buy',
    distance: 1,
    distanceToApproachRatio: 1,
    orbComplete: false,
    breakoutDetected: signal === 'BREAKOUT_DETECTED',
    manipulationDetected: false,
    reclaimConfirmed: signal === 'RECLAIM_CONFIRMED',
    alertAlreadySent: false,
    relevantCandle: 'M5',
    candle: {
      timeframe: 'M5',
      durationSeconds: 300,
      secondsRemaining: 30,
      minutes: 0,
      seconds: 30,
      percentageComplete: 90,
      finalMinute: true,
    },
    timestamp: '2026-07-19T00:00:00.000Z',
  }
}

describe('instrument priority queue', () => {
  it('applies weighted base scores and secondary conditions', () => {
    const action = calculateInstrumentPriority(input('AAA', 'ACTION_REQUIRED'))
    const approaching = calculateInstrumentPriority(input('BBB', 'APPROACHING'))
    const waiting = calculateInstrumentPriority(input('CCC', 'WAITING'))

    expect(action.status).toBe('ACTION REQUIRED')
    expect(action.score).toBe(104)
    expect(approaching.score).toBe(79)
    expect(waiting.score).toBe(19)
    expect(action.score).toBeGreaterThan(approaching.score)
  })

  it('groups a 12-instrument fixture into the requested status mix', () => {
    const signals: PrioritySignal[] = [
      'ACTION_REQUIRED',
      'APPROACHING', 'APPROACHING',
      'WATCH', 'BREAKOUT_DETECTED',
      'WAITING', 'WAITING', 'WAITING', 'MONITORING',
      'SESSION_CLOSED', 'SESSION_CLOSED',
      'MONITORING_OFF',
    ]
    const queue = signals.map((signal, index) =>
      toAlertReadyInstrumentState(input(`M${String(index).padStart(2, '0')}`, signal)))
    const groups = groupInstrumentQueue(queue)

    expect(queue).toHaveLength(12)
    expect(groups['ACTION REQUIRED']).toHaveLength(1)
    expect(groups.APPROACHING).toHaveLength(2)
    expect(groups.WATCH).toHaveLength(2)
    expect(groups.WAITING).toHaveLength(4)
    expect(groups['SESSION CLOSED']).toHaveLength(2)
    expect(groups['MONITORING OFF']).toHaveLength(1)
  })

  it('uses stable symbol ordering when group and score are equal', () => {
    const queue = ['ZZZ', 'AAA', 'MMM'].map((symbol) =>
      toAlertReadyInstrumentState(input(symbol, 'WATCH')))

    expect(sortInstrumentQueue(queue).map((item) => item.instrument.symbol)).toEqual(['AAA', 'MMM', 'ZZZ'])
  })

  it('promotes a waiting instrument above lower-priority groups', () => {
    const waiting = toAlertReadyInstrumentState(input('PROMO', 'WAITING'))
    const promoted = toAlertReadyInstrumentState(input('PROMO', 'APPROACHING'))
    const closed = toAlertReadyInstrumentState(input('CLOSED', 'SESSION_CLOSED'))

    expect(waiting.status).toBe('WAITING')
    expect(promoted.status).toBe('APPROACHING')
    expect(promoted.score).toBeGreaterThan(waiting.score)
    expect(sortInstrumentQueue([closed, promoted])[0].instrument.symbol).toBe('PROMO')
  })

  it('filters active and explicit low-priority states without re-sorting', () => {
    const approaching = toAlertReadyInstrumentState(input('APP', 'APPROACHING'))
    const closed = toAlertReadyInstrumentState(input('CLS', 'SESSION_CLOSED'))
    const off = toAlertReadyInstrumentState(input('OFF', 'MONITORING_OFF'))

    expect(matchesPriorityFilter(approaching, 'ACTIVE')).toBe(true)
    expect(matchesPriorityFilter(approaching, 'ACTION_REQUIRED')).toBe(false)
    expect(matchesPriorityFilter(toAlertReadyInstrumentState(input('ACT', 'ACTION_REQUIRED')), 'ACTION_REQUIRED')).toBe(true)
    expect(matchesPriorityFilter(closed, 'ACTIVE')).toBe(false)
    expect(matchesPriorityFilter(closed, 'SESSION_CLOSED')).toBe(true)
    expect(matchesPriorityFilter(off, 'MONITORING_OFF')).toBe(true)
  })
})
