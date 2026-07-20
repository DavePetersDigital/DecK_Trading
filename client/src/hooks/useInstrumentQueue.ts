import { useMemo } from 'react'
import { useInstrumentStore } from '../context/InstrumentContext'
import type { InstrumentPriorityInput, PrioritySignal } from '../types/instrumentPriority'
import { calculateLevelStatus, calculateManipulationClassification, calculateNearestLevel } from '../utils/trading'
import { sortInstrumentQueue, toAlertReadyInstrumentState } from '../utils/instrumentPriority'
import { selectMonitoredSession } from '../utils/instrumentSessions'
import { useSession } from './useSession'

export function useInstrumentQueue() {
  const { instruments } = useInstrumentStore()
  const sessionEngine = useSession()

  return useMemo(() => {
    const inputs: InstrumentPriorityInput[] = instruments
      .filter((instrument) => instrument.config.enabled)
      .map((instrument) => {
        const { config } = instrument
        const tradingSession = selectMonitoredSession(config, sessionEngine.sessions)
        const nearest = calculateNearestLevel(instrument.price, instrument.plan.levels)
        const levelStatus = nearest ? calculateLevelStatus(instrument.price, nearest) : 'DISABLED'
        const manipulation = calculateManipulationClassification(instrument.manipulation)
        const distance = nearest ? Math.abs(nearest.price - instrument.price) : null
        let signal: PrioritySignal = 'WAITING'

        if (!instrument.monitoring) signal = 'MONITORING_OFF'
        else if (levelStatus === 'IN ZONE' || levelStatus === 'PASSED') signal = 'WATCH_M5'
        else if (levelStatus === 'APPROACHING' || levelStatus === 'ALERT SENT') signal = 'APPROACHING'
        else if (config.strategies.manipulation && instrument.manipulation.reclaimed) signal = 'RECLAIM_CONFIRMED'
        else if (config.strategies.orb && instrument.orb.breakoutDirection) signal = 'BREAKOUT_DETECTED'
        else if (!tradingSession.isActive) signal = 'SESSION_CLOSED'
        else if (config.strategies.orb && !instrument.orb.rangeComplete) signal = 'MONITORING'

        const strategies = [
          config.strategies.dailyPlan && { id: 'plan', name: 'Daily Plan', status: levelStatus, active: levelStatus !== 'WAITING' && levelStatus !== 'DISABLED' },
          config.strategies.orb && { id: 'orb', name: 'ORB', status: instrument.orb.state, active: Boolean(instrument.orb.breakoutDirection) },
          config.strategies.structure && { id: 'structure', name: 'Structure', status: `${instrument.structure.zones.length} zones`, active: instrument.structure.zones.some((zone) => zone.enabled) },
          config.strategies.manipulation && { id: 'manipulation', name: 'Manipulation', status: instrument.manipulation.state, active: manipulation.percentage >= 20 },
        ].filter((strategy) => Boolean(strategy)) as InstrumentPriorityInput['strategies']

        return {
          definition: {
            id: config.id,
            symbol: config.symbol,
            name: config.displayName,
            precision: config.priceDecimals,
            primarySessionId: tradingSession.id,
            strategies: strategies.map((strategy) => strategy.name),
            workspace: config.workspaceEnabled ? config.symbol : null,
          },
          price: instrument.price,
          dailyChange: instrument.dailyChange,
          bias: instrument.plan.bias,
          monitoring: instrument.monitoring,
          signal,
          session: tradingSession,
          strategies,
          triggerLevel: nearest?.price ?? null,
          triggerDirection: nearest?.direction ?? null,
          distance,
          distanceToApproachRatio: nearest && distance !== null
            ? distance / Math.max(nearest.approachDistance, 0.000001)
            : null,
          orbComplete: instrument.orb.rangeComplete,
          breakoutDetected: Boolean(instrument.orb.breakoutDirection),
          manipulationDetected: manipulation.percentage >= 20,
          reclaimConfirmed: instrument.manipulation.reclaimed,
          alertAlreadySent: nearest?.alertSent ?? false,
          relevantCandle: 'M5',
          candle: sessionEngine.candles.M5,
          timestamp: sessionEngine.now.toISOString(),
        }
      })

    return sortInstrumentQueue(inputs.map(toAlertReadyInstrumentState))
  }, [instruments, sessionEngine])
}
