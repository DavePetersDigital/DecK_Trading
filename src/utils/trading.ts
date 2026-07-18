import { defaultPlan } from '../data/mockData'
import type {
  DailyPlan, InstrumentStatus, LevelStatus, ManipulationData, OrbData,
  PlannedLevel, StrategyStatus, StructureZone,
} from '../types'

export const formatPrice = (value: number, digits = 2) => value.toFixed(digits)
export const formatDistance = (value: number) => Math.abs(value).toFixed(2)
export const currentTime = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
export const isApproaching = (price: number, level: number, distance: number) => Math.abs(level - price) <= distance

export function migratePlan(raw: unknown): DailyPlan {
  if (!raw || typeof raw !== 'object') return defaultPlan
  const value = raw as Partial<DailyPlan> & { sellLevel?: number; buyLevel1?: number; buyLevel2?: number }
  if (Array.isArray(value.levels)) {
    return {
      ...defaultPlan,
      ...value,
      levels: value.levels.map((level, index) => {
        const item = level as Partial<PlannedLevel>
        return {
          id: item.id ?? `level-${index}-${Date.now()}`,
          direction: item.direction === 'Sell' ? 'Sell' : 'Buy',
          price: Number(item.price ?? 0),
          enabled: item.enabled ?? true,
          approachDistance: Number(item.approachDistance ?? value.approachDistance ?? 3),
          entryTolerance: Number(item.entryTolerance ?? value.entryTolerance ?? 0.3),
          alertSent: item.alertSent ?? false,
        }
      }),
    }
  }
  const legacyLevels = [
    ['sell', 'Sell', value.sellLevel],
    ['buy1', 'Buy', value.buyLevel1],
    ['buy2', 'Buy', value.buyLevel2],
  ] as const
  return {
    ...defaultPlan,
    bias: value.bias ?? defaultPlan.bias,
    approachDistance: Number(value.approachDistance ?? 3),
    lastSaved: value.lastSaved ?? null,
    levels: legacyLevels
      .filter((entry): entry is typeof entry & readonly [string, 'Buy' | 'Sell', number] => typeof entry[2] === 'number')
      .map(([id, direction, price]) => ({
        id, direction, price, enabled: true,
        approachDistance: Number(value.approachDistance ?? 3),
        entryTolerance: 0.3, alertSent: false,
      })),
  }
}

export function calculateNearestLevel(price: number, levels: PlannedLevel[]) {
  const enabled = levels.filter((level) => level.enabled)
  if (!enabled.length) return null
  return enabled.reduce((nearest, level) =>
    Math.abs(level.price - price) < Math.abs(nearest.price - price) ? level : nearest,
  )
}

export function calculateLevelStatus(price: number, level: PlannedLevel): LevelStatus {
  if (!level.enabled) return 'DISABLED'
  const delta = price - level.price
  if (Math.abs(delta) <= level.entryTolerance) return 'IN ZONE'
  if ((level.direction === 'Sell' && delta > level.entryTolerance) ||
      (level.direction === 'Buy' && delta < -level.entryTolerance)) return 'PASSED'
  if (Math.abs(delta) <= level.approachDistance) return level.alertSent ? 'ALERT SENT' : 'APPROACHING'
  return 'WAITING'
}

export function calculateInstrumentAttentionStatus(
  monitoring: boolean,
  sessionOpen: boolean,
  nearest: PlannedLevel | null,
  price: number,
): InstrumentStatus {
  if (!monitoring) return 'MONITORING OFF'
  if (!sessionOpen) return 'SESSION CLOSED'
  if (!nearest) return 'WAITING'
  const status = calculateLevelStatus(price, nearest)
  if (status === 'IN ZONE' || status === 'PASSED') return 'ACTION REQUIRED'
  if (status === 'APPROACHING' || status === 'ALERT SENT') return 'APPROACHING'
  return 'WAITING'
}

export function calculateGoldStatus(monitoring: boolean, sessionOpen: boolean, nearest: PlannedLevel | null, price: number): StrategyStatus {
  const attention = calculateInstrumentAttentionStatus(monitoring, sessionOpen, nearest, price)
  if (attention === 'ACTION REQUIRED') return 'WATCH M1'
  if (attention === 'WAITING' || attention === 'WATCH') return 'MONITORING'
  return attention
}

export function calculateNextAction(
  monitoring: boolean,
  sessionOpen: boolean,
  nearest: PlannedLevel | null,
  price: number,
  orb?: OrbData,
  manipulation?: ManipulationData,
) {
  if (!monitoring) return { action: 'PAUSED', detail: 'Monitoring is disabled. No alerts will be generated.' }
  if (!sessionOpen) return { action: 'WAIT', detail: 'The configured session is closed. No chart action is required.' }
  if (!nearest) return { action: 'WAIT', detail: 'No enabled daily-plan levels are available.' }
  const status = calculateLevelStatus(price, nearest)
  if (status === 'IN ZONE' || status === 'PASSED') return {
    action: 'WATCH M1', detail: `Price is at the ${nearest.direction.toLowerCase()} zone. Look for ${nearest.direction === 'Sell' ? 'bearish' : 'bullish'} confirmation.`,
  }
  if (status === 'APPROACHING' || status === 'ALERT SENT') return {
    action: 'PREPARE', detail: `Price is approaching ${formatPrice(nearest.price)}. Be ready to open the M1 chart.`,
  }
  if (manipulation?.reclaimed) return {
    action: 'WATCH M1', detail: 'The manipulation range has been reclaimed. Watch the lower timeframe for confirmation.',
  }
  if (orb?.breakoutDirection) return {
    action: 'PREPARE', detail: `A mock ORB breakout ${orb.breakoutDirection.toLowerCase()} is waiting for candle-close confirmation.`,
  }
  return { action: 'WAIT', detail: 'Price remains outside all approach zones. No chart action is required.' }
}

export function calculateOrbStatus(price: number, orb: OrbData): OrbData['state'] {
  if (!orb.rangeComplete) return 'Building opening candle'
  if (orb.breakoutDirection) return 'Waiting for confirmation'
  if (price > orb.high || price < orb.low) return 'Breakout detected'
  return 'Waiting for breakout'
}

export function calculateManipulationClassification(data: ManipulationData) {
  const percentage = ((data.firstCandleHigh - data.firstCandleLow) / data.dailyAtr) * 100
  const classification = percentage < 20 ? 'Not manipulation' : percentage < 50 ? 'Good' : percentage < 70 ? 'Strong' : 'Extreme'
  return { percentage, classification }
}

export function calculateNearestSupportResistance(price: number, zones: StructureZone[]) {
  const enabled = zones.filter((zone) => zone.enabled)
  const supports = enabled.filter((zone) => zone.type === 'Support')
  const resistances = enabled.filter((zone) => zone.type === 'Resistance')
  const nearest = (items: StructureZone[]) => items.length
    ? items.reduce((best, zone) => {
      const distance = price < zone.lowerPrice ? zone.lowerPrice - price : price > zone.upperPrice ? price - zone.upperPrice : 0
      const bestDistance = price < best.lowerPrice ? best.lowerPrice - price : price > best.upperPrice ? price - best.upperPrice : 0
      return distance < bestDistance ? zone : best
    })
    : null
  return {
    support: nearest(supports),
    resistance: nearest(resistances),
    inside: enabled.find((zone) => price >= zone.lowerPrice && price <= zone.upperPrice) ?? null,
  }
}

export const statusPriority: Record<InstrumentStatus, number> = {
  'ACTION REQUIRED': 0, APPROACHING: 1, WATCH: 2, WAITING: 3,
  'SESSION CLOSED': 4, 'MONITORING OFF': 5,
}

export const statusTone = (status: string) => {
  if (status.includes('ACTION') || status === 'PASSED') return 'danger'
  if (status.includes('APPROACH') || status.includes('WATCH') || status === 'IN ZONE') return 'warning'
  if (status.includes('MONITORING') || status.includes('ACTIVE') || status.includes('CONFIRMED')) return 'positive'
  if (status.includes('OFF') || status.includes('CLOSED') || status === 'DISABLED') return 'danger'
  return 'neutral'
}

export function getLevels(plan: DailyPlan) {
  return plan.levels.map((level) => ({ id: level.id, direction: level.direction, value: level.price }))
}

export function nearestLevel(price: number, plan: DailyPlan) {
  const nearest = calculateNearestLevel(price, plan.levels)
  return nearest ? { id: nearest.id, direction: nearest.direction, value: nearest.price } : { id: 'none', direction: 'Buy' as const, value: price }
}
