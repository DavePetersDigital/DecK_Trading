import { describe, expect, it } from 'vitest'
import { defaultSessionConfiguration } from '../config/sessionConfiguration'
import {
  buildSessionSnapshot,
  calculateCandleCountdown,
  calculateTradingSession,
} from './sessionEngine'

describe('session engine', () => {
  it('transitions Tokyo through open, closing soon, and opening soon states', () => {
    const definition = defaultSessionConfiguration.sessions.tokyo
    const open = calculateTradingSession(new Date('2026-07-20T00:00:00Z'), definition, defaultSessionConfiguration)
    const closing = calculateTradingSession(new Date('2026-07-20T05:45:00Z'), definition, defaultSessionConfiguration)
    const opening = calculateTradingSession(new Date('2026-07-20T23:45:00Z'), definition, defaultSessionConfiguration)

    expect(open.state).toBe('OPEN')
    expect(open.countdownToClose).toBe(6 * 3600)
    expect(open.progressPercentage).toBe(0)
    expect(closing.state).toBe('CLOSING_SOON')
    expect(closing.countdownToClose).toBe(15 * 60)
    expect(opening.state).toBe('OPENING_SOON')
    expect(opening.countdownToOpen).toBe(15 * 60)
  })

  it('keeps sessions closed on weekends and targets the next weekday', () => {
    const tokyo = calculateTradingSession(
      new Date('2026-07-18T03:00:00Z'),
      defaultSessionConfiguration.sessions.tokyo,
      defaultSessionConfiguration,
    )

    expect(tokyo.state).toBe('CLOSED')
    expect(tokyo.isActive).toBe(false)
    expect(tokyo.countdownToOpen).toBeGreaterThan(24 * 3600)
  })

  it('calculates London and New York overlap using timezone-aware DST', () => {
    const snapshot = buildSessionSnapshot(new Date('2026-07-20T14:00:00Z'), defaultSessionConfiguration)

    expect(snapshot.sessions.london.isActive).toBe(true)
    expect(snapshot.sessions.newYork.isActive).toBe(true)
    expect(snapshot.overlap.active).toBe(true)
    expect(snapshot.overlap.sessions).toEqual(['london', 'newYork'])
    expect(snapshot.overlap.timeRemaining).toBeGreaterThan(0)
  })

  it('calculates aligned candle countdowns and final-minute state', () => {
    const now = new Date('2026-07-20T10:14:30Z')
    const m1 = calculateCandleCountdown(now, 'M1', 120)
    const m15 = calculateCandleCountdown(now, 'M15', 120)

    expect(m1.secondsRemaining).toBe(30)
    expect(m1.finalMinute).toBe(true)
    expect(m15.minutes).toBe(0)
    expect(m15.seconds).toBe(30)
    expect(m15.percentageComplete).toBeCloseTo(96.67, 1)
  })
})
