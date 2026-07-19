import { describe, expect, it } from 'vitest'
import type { DailyPlan } from '../types'
import type { ParsedDailyPlan } from '../types/dailyPlanImport'
import { buildImportedDailyPlan } from './dailyPlanImport'

const current: DailyPlan = {
  bias: 'Neutral',
  approachDistance: 3,
  entryTolerance: 0.3,
  lastSaved: null,
  notes: 'Keep this note',
  levels: [
    { id: 'existing-sell', direction: 'Sell', price: 3992, enabled: true, approachDistance: 3, entryTolerance: 0.3, alertSent: true },
    { id: 'existing-buy', direction: 'Buy', price: 3960, enabled: true, approachDistance: 3, entryTolerance: 0.3, alertSent: false },
  ],
}

function parsed(levels: ParsedDailyPlan['levels']): ParsedDailyPlan {
  return { levels, warnings: [], unparsedLines: [] }
}

describe('buildImportedDailyPlan', () => {
  it('replaces levels while preserving omitted valid defaults and matching IDs', () => {
    const result = buildImportedDailyPlan(current, {
      ...parsed([
        { direction: 'Sell', price: 3992, sourceText: 'Sell 3992', confidence: 'high' },
        { direction: 'Buy', price: 3922, sourceText: 'Buy 3922', confidence: 'high' },
      ]),
      bias: 'Bearish',
    }, 'Replace', () => 'new-id')

    expect(result.plan.bias).toBe('Bearish')
    expect(result.plan.approachDistance).toBe(3)
    expect(result.plan.entryTolerance).toBe(0.3)
    expect(result.plan.notes).toBe('Keep this note')
    expect(result.plan.levels.map((level) => level.id)).toEqual(['existing-sell', 'new-id'])
    expect(result.plan.levels.every((level) => level.enabled && !level.alertSent)).toBe(true)
  })

  it('appends only unique prices and updates supplied shared limits', () => {
    let id = 0
    const result = buildImportedDailyPlan(current, {
      ...parsed([
        { direction: 'Sell', price: 3992, sourceText: 'Sell 3992', confidence: 'high' },
        { direction: 'Buy', price: 3970, sourceText: 'Buy 3970', confidence: 'high' },
        { direction: 'Sell', price: 3970, sourceText: 'Sell 3970', confidence: 'high' },
      ]),
      approachDistance: 4,
      entryTolerance: 0.5,
    }, 'Append', () => `new-${++id}`)

    expect(result.plan.levels).toHaveLength(3)
    expect(result.plan.levels.at(-1)).toMatchObject({ id: 'new-1', price: 3970, approachDistance: 4, entryTolerance: 0.5 })
    expect(result.plan.levels.slice(0, 2).every((level) => level.approachDistance === 4 && level.entryTolerance === 0.5)).toBe(true)
    expect(result.buyLevels).toBe(1)
    expect(result.sellLevels).toBe(0)
  })
})
