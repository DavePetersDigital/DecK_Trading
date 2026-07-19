import { describe, expect, it } from 'vitest'
import { defaultInstrumentConfigurations } from '../config/instrumentRegistry'
import { isGoldInstrument, isInstrumentMatch, parseDailyPlanText } from './dailyPlanParser'

describe('parseDailyPlanText', () => {
  it('parses the standard labelled plan format', () => {
    const result = parseDailyPlanText(`
      Bias: Neutral
      Sell: 3992
      Buy: 3960
      Buy: 3922
      Approach distance: 3
      Entry tolerance: 0.3
    `)

    expect(result.bias).toBe('Neutral')
    expect(result.levels.map(({ direction, price }) => ({ direction, price }))).toEqual([
      { direction: 'Sell', price: 3992 },
      { direction: 'Buy', price: 3960 },
      { direction: 'Buy', price: 3922 },
    ])
    expect(result.approachDistance).toBe(3)
    expect(result.entryTolerance).toBe(0.3)
  })

  it('supports plan headings, aliases, lists, punctuation and leading decimals', () => {
    const result = parseDailyPlanText(`
      GOLD PLAN
      Daily Bias - Bearish
      Resistance 4,005
      Sell zone 3992
      Support 3960, 3922
      Approach 3 points
      Tolerance .30
    `)

    expect(result.instrument).toBe('XAUUSD')
    expect(result.bias).toBe('Bearish')
    expect(result.levels.filter((level) => level.direction === 'Sell').map((level) => level.price)).toEqual([4005, 3992])
    expect(result.levels.filter((level) => level.direction === 'Buy').map((level) => level.price)).toEqual([3960, 3922])
    expect(result.entryTolerance).toBe(0.3)
  })

  it('associates an instrument-qualified outlook and parses slash-separated levels', () => {
    const result = parseDailyPlanText(`
      XAUUSD bullish
      Buy levels = 3980 / 3970
      Sell levels = 4010 / 4025
    `)

    expect(result.instrument).toBe('XAUUSD')
    expect(result.bias).toBe('Bullish')
    expect(result.levels).toHaveLength(4)
  })

  it('detects a non-Gold instrument without blocking valid parsing', () => {
    const result = parseDailyPlanText(`
      EURUSD Plan
      Bias: Bullish
      Buy: 1.0840
    `)

    expect(result.instrument).toBe('EURUSD')
    expect(isGoldInstrument(result.instrument)).toBe(false)
    expect(result.levels[0].price).toBe(1.084)
  })

  it('validates a parsed instrument against the current reusable workspace', () => {
    const eurusd = defaultInstrumentConfigurations.find((config) => config.symbol === 'EURUSD')!
    const result = parseDailyPlanText('Instrument: EUR/USD\nBuy: 1.08420')

    expect(result.instrument).toBe('EURUSD')
    expect(isInstrumentMatch(result.instrument, eurusd)).toBe(true)
    expect(isInstrumentMatch('XAUUSD', eurusd)).toBe(false)
  })

  it('does not turn unlabelled sentence numbers into levels', () => {
    const result = parseDailyPlanText('Wait for price near 3992 and watch M1.')

    expect(result.levels).toHaveLength(0)
    expect(result.unparsedLines).toEqual(['Wait for price near 3992 and watch M1.'])
    expect(result.warnings.some((warning) => warning.includes('Ambiguous numeric text'))).toBe(true)
  })

  it('deduplicates levels and supports labels on separate lines', () => {
    const result = parseDailyPlanText(`
      Buy levels
      3,992.00 / 3980
      Buy: 3992
    `)

    expect(result.levels.map((level) => level.price)).toEqual([3992, 3980])
    expect(result.warnings.some((warning) => warning.includes('Duplicate'))).toBe(true)
  })
})
