import { describe, expect, it } from 'vitest'
import { defaultInstrumentConfigurations } from '../config/instrumentRegistry'
import type { SessionId, TradingSession } from '../types/session'
import { hasActiveMonitoredSession, selectMonitoredSession } from './instrumentSessions'

function session(id: SessionId, state: TradingSession['state'], countdownToOpen: number): TradingSession {
  return {
    id,
    name: id === 'newYork' ? 'New York' : id[0].toUpperCase() + id.slice(1),
    state,
    openTime: '',
    closeTime: '',
    localTime: '',
    countdownToOpen,
    countdownToClose: 0,
    progressPercentage: 0,
    isActive: state === 'OPEN' || state === 'CLOSING_SOON',
    timeRemaining: 0,
    classification: state === 'OPEN' ? 'open' : state === 'CLOSING_SOON' ? 'closing' : state === 'OPENING_SOON' ? 'opening' : 'closed',
  }
}

describe('instrument monitored sessions', () => {
  const gold = defaultInstrumentConfigurations.find((config) => config.symbol === 'XAUUSD')!

  it('uses whichever monitored session is currently active', () => {
    const sessions = {
      tokyo: session('tokyo', 'CLOSED', 100),
      london: session('london', 'OPEN', 0),
      newYork: session('newYork', 'CLOSED', 200),
    }

    expect(selectMonitoredSession(gold, sessions).id).toBe('london')
    expect(hasActiveMonitoredSession(gold, sessions)).toBe(true)
  })

  it('uses the next opening monitored session when none are active', () => {
    const sessions = {
      tokyo: session('tokyo', 'CLOSED', 300),
      london: session('london', 'CLOSED', 200),
      newYork: session('newYork', 'OPENING_SOON', 100),
    }

    expect(selectMonitoredSession(gold, sessions).id).toBe('newYork')
    expect(hasActiveMonitoredSession(gold, sessions)).toBe(false)
  })
})
