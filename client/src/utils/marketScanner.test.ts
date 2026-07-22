import { describe, expect, it } from 'vitest'
import {
  breakoutLabel,
  displayedBreakoutLabel,
  isProfileBeingMonitored,
  manipulationLabel,
  rowTintForMonitor,
  selectRelevantProfile,
  tradingWindowStatus,
  type RankableProfile,
} from './marketScanner'
import type { OrbMonitor } from '../services/orbApi'

function monitor(overrides: Partial<OrbMonitor> = {}): OrbMonitor {
  return {
    key: '41|tokyo-fx|2026-07-22',
    symbolId: '41',
    symbolName: 'XAUUSD',
    displayName: 'Gold',
    profileId: 'tokyo-fx',
    profileName: 'Tokyo FX',
    manipulationMode: 'gold_specific',
    alertMode: 'all_breakouts',
    tradingDate: '2026-07-22',
    openingInstantUtc: '2026-07-22T00:00:00.000Z',
    openingCandleCloseUtc: '2026-07-22T00:15:00.000Z',
    closingInstantUtc: '2026-07-22T06:00:00.000Z',
    tradingWindowMinutes: 120,
    allowTradesAfterWindow: false,
    tradingWindowEndUtc: '2026-07-22T02:00:00.000Z',
    phase: 'monitoring',
    openingRange: null,
    manipulation: {
      mode: 'gold_specific',
      manipulation: true,
      classification: 'LARGE',
      rank: 0.85,
      sampleCount: 20,
      message: '',
    },
    trend: null,
    m5Breakout: { direction: 'high', candleTime: '2026-07-22T00:30:00.000Z', confirmedAt: '2026-07-22T00:35:00.000Z' },
    m15Breakout: { direction: null, candleTime: null, confirmedAt: null },
    upsideAlertAt: null,
    downsideAlertAt: null,
    updatedAt: '2026-07-22T00:35:00.000Z',
    ...overrides,
  }
}

function rank(overrides: Partial<RankableProfile> & Pick<RankableProfile, 'id'>): RankableProfile {
  return {
    openingInstantUtc: '2026-07-22T00:00:00.000Z',
    closingInstantUtc: '2026-07-22T06:00:00.000Z',
    marketOpen: false,
    tradingWindowOpen: false,
    extendedMonitoring: false,
    hasBreakout: false,
    secondsToOpen: 3600,
    ...overrides,
  }
}

describe('manipulationLabel', () => {
  it('maps classifications to scanner labels', () => {
    expect(manipulationLabel({ mode: 'gold_specific', manipulation: false, classification: 'NORMAL', rank: 0.1, sampleCount: 20, message: '' })).toBe('No')
    expect(manipulationLabel({ mode: 'gold_specific', manipulation: true, classification: 'ELEVATED', rank: 0.7, sampleCount: 20, message: '' })).toBe('Normal')
    expect(manipulationLabel({ mode: 'gold_specific', manipulation: true, classification: 'LARGE', rank: 0.85, sampleCount: 20, message: '' })).toBe('Large')
    expect(manipulationLabel({ mode: 'gold_specific', manipulation: true, classification: 'EXTREME', rank: 0.97, sampleCount: 20, message: '' })).toBe('Extreme')
  })

  it('maps normal ATR results without showing a dash', () => {
    expect(manipulationLabel({
      mode: 'normal',
      manipulation: false,
      classification: 'NORMAL',
      rank: 10,
      sampleCount: 14,
      message: '',
    })).toBe('No')
    expect(manipulationLabel({
      mode: 'normal',
      manipulation: true,
      classification: 'NORMAL',
      rank: 35,
      sampleCount: 14,
      message: '',
    })).toBe('Normal')
    expect(manipulationLabel({
      mode: 'normal',
      manipulation: true,
      classification: 'LARGE',
      rank: 55,
      sampleCount: 14,
      message: '',
    })).toBe('Large')
    expect(manipulationLabel({
      mode: 'normal',
      manipulation: true,
      classification: 'EXTREME',
      rank: 80,
      sampleCount: 14,
      message: '',
    })).toBe('Extreme')
  })

  it('still shows a dash for pending or insufficient history', () => {
    expect(manipulationLabel({
      mode: 'normal',
      manipulation: null,
      classification: 'PENDING_IMPLEMENTATION',
      rank: null,
      sampleCount: 0,
      message: '',
    })).toBe('—')
    expect(manipulationLabel({
      mode: 'normal',
      manipulation: null,
      classification: 'INSUFFICIENT_HISTORY',
      rank: null,
      sampleCount: 5,
      message: '',
    })).toBe('—')
  })
})

describe('breakoutLabel', () => {
  it('maps directions and inside-after-breakout', () => {
    expect(breakoutLabel(null)).toBe('No Breakout')
    expect(breakoutLabel('high')).toBe('ORB High Broken')
    expect(breakoutLabel('low')).toBe('ORB Low Broken')
    expect(breakoutLabel({
      direction: null,
      zone: 'inside',
      hadBreakout: true,
      candleTime: '2026-07-22T00:20:00.000Z',
      confirmedAt: '2026-07-22T00:25:00.000Z',
    })).toBe('Inside ORB')
  })
})

describe('rowTintForMonitor', () => {
  it('qualified mode requires manipulation and a breakout', () => {
    expect(rowTintForMonitor(monitor(), 'qualified')).toBe('bullish')
    expect(rowTintForMonitor(monitor({
      manipulation: { mode: 'gold_specific', manipulation: false, classification: 'NORMAL', rank: 0.1, sampleCount: 20, message: '' },
    }), 'qualified')).toBe('none')
  })

  it('any mode highlights without manipulation', () => {
    expect(rowTintForMonitor(monitor({
      manipulation: { mode: 'gold_specific', manipulation: false, classification: 'NORMAL', rank: 0.1, sampleCount: 20, message: '' },
    }), 'any')).toBe('bullish')
  })

  it('never mode always returns none', () => {
    expect(rowTintForMonitor(monitor(), 'never')).toBe('none')
  })

  it('uses neutral tint when M5 and M15 disagree', () => {
    expect(rowTintForMonitor(monitor({
      m15Breakout: { direction: 'low', candleTime: '2026-07-22T00:45:00.000Z', confirmedAt: '2026-07-22T01:00:00.000Z' },
    }), 'any')).toBe('neutral')
  })

  it('suppresses highlight for post-window breakouts when allowTradesAfterWindow is false', () => {
    expect(rowTintForMonitor(monitor({
      m5Breakout: { direction: 'high', candleTime: '2026-07-22T02:10:00.000Z', confirmedAt: '2026-07-22T02:15:00.000Z' },
    }), 'any')).toBe('none')
  })

  it('removes directional highlight after the active breakout returns inside', () => {
    expect(rowTintForMonitor(monitor({
      m5Breakout: {
        direction: null,
        zone: 'inside',
        hadBreakout: true,
        candleTime: '2026-07-22T00:20:00.000Z',
        confirmedAt: '2026-07-22T00:25:00.000Z',
      },
      m15Breakout: { direction: null, zone: 'inside', hadBreakout: false, candleTime: null, confirmedAt: null },
    }), 'qualified')).toBe('none')
  })
})

describe('tradingWindowStatus', () => {
  it('reports open / closing soon / closed', () => {
    const open = tradingWindowStatus(
      '2026-07-22T00:00:00.000Z',
      '2026-07-22T02:00:00.000Z',
      120,
      false,
      new Date('2026-07-22T00:30:00.000Z'),
    )
    expect(open.label).toBe('Open')
    expect(open.tone).toBe('green')

    const soon = tradingWindowStatus(
      '2026-07-22T00:00:00.000Z',
      '2026-07-22T02:00:00.000Z',
      120,
      false,
      new Date('2026-07-22T01:45:00.000Z'),
    )
    expect(soon.label).toBe('Closing Soon')
    expect(soon.tone).toBe('red')

    const closed = tradingWindowStatus(
      '2026-07-22T00:00:00.000Z',
      '2026-07-22T02:00:00.000Z',
      120,
      true,
      new Date('2026-07-22T03:00:00.000Z'),
    )
    expect(closed.label).toBe('Closed')
    expect(closed.detail).toContain('Extended monitoring on')
  })
})

describe('selectRelevantProfile', () => {
  it('prefers a profile inside its trading window', () => {
    const selected = selectRelevantProfile([
      rank({ id: 'london-fx', marketOpen: true, tradingWindowOpen: false, openingInstantUtc: '2026-07-22T07:00:00.000Z' }),
      rank({ id: 'tokyo-fx', marketOpen: true, tradingWindowOpen: true, openingInstantUtc: '2026-07-22T00:00:00.000Z' }),
    ])
    expect(selected?.id).toBe('tokyo-fx')
  })

  it('falls back to market-open when no trading window is active', () => {
    const selected = selectRelevantProfile([
      rank({ id: 'new-york-fx', marketOpen: false, secondsToOpen: 100, openingInstantUtc: '2026-07-22T13:00:00.000Z' }),
      rank({ id: 'london-fx', marketOpen: true, openingInstantUtc: '2026-07-22T07:00:00.000Z' }),
    ])
    expect(selected?.id).toBe('london-fx')
  })

  it('prefers extended monitoring over a plain upcoming session', () => {
    const selected = selectRelevantProfile([
      rank({ id: 'tokyo-fx', extendedMonitoring: true, openingInstantUtc: '2026-07-22T00:00:00.000Z' }),
      rank({ id: 'london-fx', secondsToOpen: 60, openingInstantUtc: '2026-07-22T07:00:00.000Z' }),
    ])
    expect(selected?.id).toBe('tokyo-fx')
  })

  it('prefers the next profile due to open', () => {
    const selected = selectRelevantProfile([
      rank({ id: 'london-fx', secondsToOpen: 500, openingInstantUtc: '2026-07-22T07:00:00.000Z' }),
      rank({ id: 'new-york-fx', secondsToOpen: 100, openingInstantUtc: '2026-07-22T13:00:00.000Z' }),
    ])
    expect(selected?.id).toBe('new-york-fx')
  })

  it('breaks ties with the most recent session start', () => {
    const selected = selectRelevantProfile([
      rank({ id: 'tokyo-fx', tradingWindowOpen: true, openingInstantUtc: '2026-07-22T00:00:00.000Z' }),
      rank({ id: 'london-fx', tradingWindowOpen: true, openingInstantUtc: '2026-07-22T07:00:00.000Z' }),
    ])
    expect(selected?.id).toBe('london-fx')
  })
})

describe('isProfileBeingMonitored / displayedBreakoutLabel', () => {
  it('is monitored when market, window, or extended monitoring is active', () => {
    expect(isProfileBeingMonitored({ marketOpen: true, tradingWindowOpen: false, extendedMonitoring: false })).toBe(true)
    expect(isProfileBeingMonitored({ marketOpen: false, tradingWindowOpen: true, extendedMonitoring: false })).toBe(true)
    expect(isProfileBeingMonitored({ marketOpen: false, tradingWindowOpen: false, extendedMonitoring: true })).toBe(true)
    expect(isProfileBeingMonitored({ marketOpen: false, tradingWindowOpen: false, extendedMonitoring: false })).toBe(false)
  })

  it('clears breakout labels when monitoring has ended', () => {
    expect(displayedBreakoutLabel(true, 'high')).toBe('ORB High Broken')
    expect(displayedBreakoutLabel(true, null)).toBe('No Breakout')
    expect(displayedBreakoutLabel(false, 'low')).toBe('—')
    expect(displayedBreakoutLabel(false, 'high')).toBe('—')
  })
})
