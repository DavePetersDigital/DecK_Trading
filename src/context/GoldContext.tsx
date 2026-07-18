/* oxlint-disable react/only-export-components */
import { createContext, useContext, useEffect, useState } from 'react'
import { BASE_PRICE, defaultManipulation, defaultOrb, defaultPlan, defaultStructure, initialAlerts } from '../data/mockData'
import type {
  ActivityCategory, Alert, DailyPlan, GoldState, ManipulationData, OrbData,
  PlannedLevel, StructureData, StructureZone,
} from '../types'
import {
  calculateManipulationClassification, calculateOrbStatus, currentTime,
  migratePlan,
} from '../utils/trading'

const STORAGE_KEY = 'deck-gold-state-v2'

function activity(category: ActivityCategory, event: string, price: number | null, status = 'Recorded') {
  return { id: crypto.randomUUID(), timestamp: new Date().toISOString(), category, event, price, status }
}

function loadInitialState(): GoldState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<GoldState>
      return {
        price: Number(parsed.price ?? BASE_PRICE),
        plan: migratePlan(parsed.plan),
        monitoring: parsed.monitoring ?? true,
        orb: { ...defaultOrb, ...parsed.orb },
        manipulation: { ...defaultManipulation, ...parsed.manipulation },
        structure: { ...defaultStructure, ...parsed.structure, zones: parsed.structure?.zones ?? defaultStructure.zones },
        alerts: parsed.alerts ?? initialAlerts,
        history: parsed.history ?? [],
        lastStatusUpdate: parsed.lastStatusUpdate ?? new Date().toISOString(),
      }
    }
    const legacyPlan = localStorage.getItem('dp-plan')
    return {
      price: BASE_PRICE,
      plan: legacyPlan ? migratePlan(JSON.parse(legacyPlan)) : defaultPlan,
      monitoring: true,
      orb: defaultOrb,
      manipulation: defaultManipulation,
      structure: defaultStructure,
      alerts: initialAlerts,
      history: [],
      lastStatusUpdate: new Date().toISOString(),
    }
  } catch {
    return {
      price: BASE_PRICE, plan: defaultPlan, monitoring: true, orb: defaultOrb,
      manipulation: defaultManipulation, structure: defaultStructure,
      alerts: initialAlerts, history: [], lastStatusUpdate: new Date().toISOString(),
    }
  }
}

interface GoldContextValue extends GoldState {
  setPrice: (price: number) => void
  savePlan: (plan: DailyPlan) => void
  addLevel: (direction: PlannedLevel['direction']) => void
  removeLevel: (id: string) => void
  updateLevel: (id: string, patch: Partial<PlannedLevel>) => void
  setMonitoring: (enabled: boolean) => void
  addTestAlert: () => void
  clearAlerts: () => void
  updateOrb: (patch: Partial<OrbData>) => void
  resetOrb: () => void
  updateManipulation: (patch: Partial<ManipulationData>) => void
  resetManipulation: () => void
  updateStructure: (patch: Partial<StructureData>) => void
  addZone: () => void
  updateZone: (id: string, patch: Partial<StructureZone>) => void
  removeZone: (id: string) => void
  clearHistory: () => void
}

const GoldContext = createContext<GoldContextValue | null>(null)

export function GoldProvider({ children }: { children: React.ReactNode }) {
  const [gold, setGold] = useState(loadInitialState)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(gold))
    localStorage.setItem('dp-plan', JSON.stringify(gold.plan))
  }, [gold])

  const setPrice = (nextPrice: number) => {
    const price = Number(nextPrice.toFixed(2))
    setGold((old) => {
      const now = new Date().toISOString()
      const newAlerts: Alert[] = []
      const newEvents = []
      const levels = old.plan.levels.map((level) => {
        const inApproach = level.enabled && Math.abs(level.price - price) <= level.approachDistance
        const inEntryZone = level.enabled && Math.abs(level.price - price) <= level.entryTolerance
        const wasInEntryZone = level.enabled && Math.abs(level.price - old.price) <= level.entryTolerance
        if (inEntryZone && !wasInEntryZone) {
          newEvents.push(activity('LEVEL', `Price entered ${level.direction} zone at ${level.price}`, price, 'In zone'))
        }
        if (old.monitoring && inApproach && !level.alertSent) {
          newAlerts.push({
            id: crypto.randomUUID(), time: currentTime(), type: 'LEVEL',
            message: `XAUUSD approaching ${level.direction.toLowerCase()} level ${level.price}`,
            status: 'Active',
          })
          newEvents.push(activity('ALERT', `Approach alert generated for ${level.direction} ${level.price}`, price, 'Sent'))
          return { ...level, alertSent: true }
        }
        if (!inApproach && level.alertSent) return { ...level, alertSent: false }
        return level
      })

      let orb = { ...old.orb }
      const orbState = calculateOrbStatus(price, orb)
      if (orbState === 'Breakout detected' && !orb.breakoutDirection) {
        orb = {
          ...orb,
          state: 'Breakout detected',
          breakoutDirection: price > orb.high ? 'Up' : 'Down',
          breakoutTimestamp: now,
        }
        newEvents.push(activity('ORB', `Mock ORB breakout ${orb.breakoutDirection}`, price, 'Mock'))
      } else if (!orb.breakoutDirection) orb.state = orbState

      let manipulation = { ...old.manipulation }
      const { percentage } = calculateManipulationClassification(manipulation)
      if (manipulation.candleComplete && percentage >= 20) {
        if (!manipulation.breakoutDirection && (price > manipulation.firstCandleHigh || price < manipulation.firstCandleLow)) {
          manipulation.breakoutDirection = price > manipulation.firstCandleHigh ? 'Up' : 'Down'
          manipulation.state = 'Waiting for reclaim'
          newEvents.push(activity('MANIPULATION', `Range break ${manipulation.breakoutDirection}`, price, 'Mock'))
        } else if (manipulation.breakoutDirection && !manipulation.reclaimed &&
          price <= manipulation.firstCandleHigh && price >= manipulation.firstCandleLow) {
          manipulation.reclaimed = true
          manipulation.state = 'Watch lower timeframe'
          newEvents.push(activity('MANIPULATION', 'Mock reclaim confirmed', price, 'Confirmed'))
        }
      } else if (manipulation.candleComplete) manipulation.state = 'Manipulation not detected'

      return {
        ...old, price, plan: { ...old.plan, levels }, orb, manipulation,
        alerts: [...newAlerts, ...old.alerts],
        history: [...newEvents, ...old.history],
        lastStatusUpdate: now,
      }
    })
  }

  const savePlan = (plan: DailyPlan) => setGold((old) => ({
    ...old, plan,
    history: [activity('PLAN', 'Daily plan saved', old.price, 'Saved'), ...old.history],
    lastStatusUpdate: new Date().toISOString(),
  }))

  const addLevel = (direction: PlannedLevel['direction']) => setGold((old) => {
    const level: PlannedLevel = {
      id: crypto.randomUUID(), direction, price: Number(old.price.toFixed(2)), enabled: true,
      approachDistance: old.plan.approachDistance, entryTolerance: old.plan.entryTolerance, alertSent: false,
    }
    return {
      ...old, plan: { ...old.plan, levels: [...old.plan.levels, level] },
      history: [activity('LEVEL', `${direction} level added`, level.price, 'Added'), ...old.history],
    }
  })

  const removeLevel = (id: string) => setGold((old) => {
    const target = old.plan.levels.find((level) => level.id === id)
    return {
      ...old, plan: { ...old.plan, levels: old.plan.levels.filter((level) => level.id !== id) },
      history: target ? [activity('LEVEL', `${target.direction} level removed`, target.price, 'Removed'), ...old.history] : old.history,
    }
  })

  const updateLevel = (id: string, patch: Partial<PlannedLevel>) => setGold((old) => ({
    ...old,
    plan: { ...old.plan, levels: old.plan.levels.map((level) => level.id === id ? { ...level, ...patch } : level) },
  }))

  const setMonitoring = (monitoring: boolean) => setGold((old) => ({
    ...old, monitoring,
    history: [activity('MONITORING', `Monitoring ${monitoring ? 'enabled' : 'disabled'}`, old.price, monitoring ? 'On' : 'Off'), ...old.history],
    lastStatusUpdate: new Date().toISOString(),
  }))

  const addTestAlert = () => setGold((old) => ({
    ...old,
    alerts: [{ id: crypto.randomUUID(), time: currentTime(), type: 'TEST', message: `Test alert at XAUUSD ${old.price.toFixed(2)}`, status: 'Sent' }, ...old.alerts],
  }))

  const updateOrb = (patch: Partial<OrbData>) => setGold((old) => ({ ...old, orb: { ...old.orb, ...patch } }))
  const resetOrb = () => setGold((old) => ({
    ...old, orb: defaultOrb,
    history: [activity('ORB', 'ORB mock state reset', old.price, 'Reset'), ...old.history],
  }))
  const updateManipulation = (patch: Partial<ManipulationData>) => setGold((old) => ({
    ...old, manipulation: { ...old.manipulation, ...patch },
    history: [activity('MANIPULATION', 'Manipulation mock state changed', old.price, 'Mock'), ...old.history],
  }))
  const resetManipulation = () => setGold((old) => ({ ...old, manipulation: defaultManipulation }))
  const updateStructure = (patch: Partial<StructureData>) => setGold((old) => ({ ...old, structure: { ...old.structure, ...patch } }))
  const addZone = () => setGold((old) => {
    const zone: StructureZone = {
      id: crypto.randomUUID(), label: 'New zone', type: 'Support', timeframe: '4H',
      upperPrice: old.price + 1, lowerPrice: old.price - 1, enabled: true, notes: '',
    }
    return {
      ...old, structure: { ...old.structure, zones: [...old.structure.zones, zone] },
      history: [activity('STRUCTURE', 'Structure zone added', old.price, 'Added'), ...old.history],
    }
  })
  const updateZone = (id: string, patch: Partial<StructureZone>) => setGold((old) => ({
    ...old, structure: { ...old.structure, zones: old.structure.zones.map((zone) => zone.id === id ? { ...zone, ...patch } : zone) },
  }))
  const removeZone = (id: string) => setGold((old) => ({
    ...old, structure: { ...old.structure, zones: old.structure.zones.filter((zone) => zone.id !== id) },
    history: [activity('STRUCTURE', 'Structure zone removed', old.price, 'Removed'), ...old.history],
  }))

  return (
    <GoldContext.Provider value={{
      ...gold, setPrice, savePlan, addLevel, removeLevel, updateLevel, setMonitoring,
      addTestAlert, clearAlerts: () => setGold((old) => ({ ...old, alerts: [] })),
      updateOrb, resetOrb, updateManipulation, resetManipulation,
      updateStructure, addZone, updateZone, removeZone,
      clearHistory: () => setGold((old) => ({ ...old, history: [] })),
    }}>
      {children}
    </GoldContext.Provider>
  )
}

export function useGold() {
  const context = useContext(GoldContext)
  if (!context) throw new Error('useGold must be used inside GoldProvider')
  return context
}
