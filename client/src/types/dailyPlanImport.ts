import type { Bias, Direction } from './index'

export type ImportConfidence = 'high' | 'medium'
export type PlanImportMode = 'Replace' | 'Append'

export interface ParsedDailyPlanLevel {
  direction: Direction
  price: number
  sourceText: string
  confidence: ImportConfidence
  warning?: string
}

export interface ParsedDailyPlan {
  instrument?: string
  bias?: Bias
  levels: ParsedDailyPlanLevel[]
  approachDistance?: number
  entryTolerance?: number
  notes?: string
  dateSessionLabel?: string
  warnings: string[]
  unparsedLines: string[]
}
