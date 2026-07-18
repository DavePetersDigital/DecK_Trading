import { useGold } from '../context/GoldContext'
import type { Instrument } from '../types'
import {
  calculateInstrumentAttentionStatus, calculateLevelStatus,
  calculateNearestLevel, formatDistance, formatPrice,
} from '../utils/trading'

export function useGoldInstrument(): Instrument {
  const gold = useGold()
  const nearest = calculateNearestLevel(gold.price, gold.plan.levels)
  const status = calculateInstrumentAttentionStatus(gold.monitoring, true, nearest, gold.price)
  const levelStatus = nearest ? calculateLevelStatus(gold.price, nearest) : 'WAITING'
  return {
    symbol: 'XAUUSD', name: 'Gold / U.S. Dollar', price: gold.price, dailyChange: 0.11,
    status, bias: gold.plan.bias, session: 'London Open',
    strategies: [
      { name: 'Daily Plan', status: nearest ? `${levelStatus.toLowerCase()} ${nearest.direction.toLowerCase()}` : 'No levels' },
      { name: 'ORB', status: gold.orb.state },
      { name: 'Manipulation', status: gold.manipulation.state },
    ],
    nextEvent: !gold.monitoring
      ? 'Monitoring disabled'
      : nearest
        ? `${nearest.direction} level ${formatPrice(nearest.price)} — ${formatDistance(nearest.price - gold.price)} away`
        : 'No active setup',
  }
}
