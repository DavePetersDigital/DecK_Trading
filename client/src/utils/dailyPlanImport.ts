import type { DailyPlan, PlannedLevel } from '../types'
import type { ParsedDailyPlan, PlanImportMode } from '../types/dailyPlanImport'

export interface DailyPlanImportBuild {
  plan: DailyPlan
  buyLevels: number
  sellLevels: number
}

export function buildImportedDailyPlan(
  current: DailyPlan,
  parsed: ParsedDailyPlan,
  mode: PlanImportMode,
  createId: () => string = () => crypto.randomUUID(),
): DailyPlanImportBuild {
  const approachDistance = parsed.approachDistance ?? current.approachDistance
  const entryTolerance = parsed.entryTolerance ?? current.entryTolerance
  const existingPrices = new Set(mode === 'Append' ? current.levels.map((level) => level.price) : [])
  const importedLevels: PlannedLevel[] = []

  parsed.levels.forEach((level) => {
    if (!Number.isFinite(level.price) || level.price <= 0 || existingPrices.has(level.price)) return
    existingPrices.add(level.price)
    const existing = current.levels.find((candidate) =>
      candidate.direction === level.direction && candidate.price === level.price)
    importedLevels.push({
      id: existing?.id ?? createId(),
      direction: level.direction,
      price: level.price,
      enabled: true,
      approachDistance,
      entryTolerance,
      alertSent: false,
    })
  })

  const retainedLevels = mode === 'Append'
    ? current.levels.map((level) => ({
      ...level,
      approachDistance: parsed.approachDistance === undefined ? level.approachDistance : approachDistance,
      entryTolerance: parsed.entryTolerance === undefined ? level.entryTolerance : entryTolerance,
    }))
    : []

  return {
    plan: {
      ...current,
      bias: parsed.bias ?? current.bias,
      approachDistance,
      entryTolerance,
      levels: [...retainedLevels, ...importedLevels],
      notes: parsed.notes ?? current.notes,
      dateSessionLabel: parsed.dateSessionLabel ?? current.dateSessionLabel,
      lastSaved: new Date().toISOString(),
    },
    buyLevels: importedLevels.filter((level) => level.direction === 'Buy').length,
    sellLevels: importedLevels.filter((level) => level.direction === 'Sell').length,
  }
}
