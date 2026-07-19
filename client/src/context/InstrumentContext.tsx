/* oxlint-disable react/only-export-components */
import { createContext, useContext, useEffect, useState } from 'react'
import type {
  ActivityCategory, ActivityEvent, Alert, DailyPlan, InstrumentConfiguration,
  InstrumentStoreState, InstrumentWorkspaceState, ManipulationData, OrbData,
  PlannedLevel, StructureData, StructureZone,
} from '../types'
import {
  createDefaultInstrumentState, createInitialInstrumentStore, INSTRUMENT_STORE_KEY,
  serializeInstrumentStore,
} from '../services/instrumentStore'
import {
  calculateManipulationClassification, calculateOrbStatus, currentTime,
} from '../utils/trading'

function activity(category: ActivityCategory, event: string, price: number | null, status = 'Recorded'): ActivityEvent {
  return { id: crypto.randomUUID(), timestamp: new Date().toISOString(), category, event, price, status }
}

interface InstrumentWorkspaceActions {
  setPrice: (price: number) => void
  savePlan: (plan: DailyPlan) => void
  importPlan: (plan: DailyPlan, summary: { buyLevels: number; sellLevels: number; mode: 'Replace' | 'Append' }) => void
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

interface InstrumentContextValue {
  store: InstrumentStoreState
  instruments: InstrumentWorkspaceState[]
  selectedSymbol: string
  current: InstrumentWorkspaceState
  selectInstrument: (symbol: string) => boolean
  getInstrumentState: (symbol: string) => InstrumentWorkspaceState | undefined
  addInstrument: (config: InstrumentConfiguration) => boolean
  updateInstrument: (symbol: string, patch: Partial<InstrumentConfiguration>) => void
  setInstrumentMonitoring: (symbol: string, enabled: boolean) => void
  removeInstrument: (symbol: string) => boolean
  replaceStore: (store: InstrumentStoreState) => void
  actions: InstrumentWorkspaceActions
}

const InstrumentContext = createContext<InstrumentContextValue | null>(null)

export function InstrumentProvider({ children }: { children: React.ReactNode }) {
  const [store, setStore] = useState(() => createInitialInstrumentStore(localStorage))
  const [selectedSymbol, setSelectedSymbol] = useState('XAUUSD')

  useEffect(() => {
    localStorage.setItem(INSTRUMENT_STORE_KEY, serializeInstrumentStore(store))
  }, [store])

  const updateSelected = (updater: (state: InstrumentWorkspaceState) => InstrumentWorkspaceState) => {
    setStore((old) => {
      const state = old.instruments[selectedSymbol]
      if (!state) return old
      return { ...old, instruments: { ...old.instruments, [selectedSymbol]: updater(state) } }
    })
  }

  const setPrice = (nextPrice: number) => updateSelected((old) => {
    const price = Number(nextPrice.toFixed(old.config.priceDecimals))
    const now = new Date().toISOString()
    const newAlerts: Alert[] = []
    const newEvents: ActivityEvent[] = []
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
          message: `${old.config.symbol} approaching ${level.direction.toLowerCase()} level ${level.price}`,
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

  const actions: InstrumentWorkspaceActions = {
    setPrice,
    savePlan: (plan) => updateSelected((old) => ({
      ...old, plan,
      history: [activity('PLAN', 'Daily plan saved', old.price, 'Saved'), ...old.history],
      lastStatusUpdate: new Date().toISOString(),
    })),
    importPlan: (plan, summary) => updateSelected((old) => ({
      ...old,
      plan,
      history: [
        activity('PLAN', `Daily plan imported from pasted text — ${summary.buyLevels} buy, ${summary.sellLevels} sell · ${plan.bias} · ${summary.mode}`, old.price, 'Imported'),
        ...old.history,
      ],
      lastStatusUpdate: new Date().toISOString(),
    })),
    addLevel: (direction) => updateSelected((old) => {
      const level: PlannedLevel = {
        id: crypto.randomUUID(), direction, price: Number(old.price.toFixed(old.config.priceDecimals)), enabled: true,
        approachDistance: old.plan.approachDistance, entryTolerance: old.plan.entryTolerance, alertSent: false,
      }
      return {
        ...old, plan: { ...old.plan, levels: [...old.plan.levels, level] },
        history: [activity('LEVEL', `${direction} level added`, level.price, 'Added'), ...old.history],
      }
    }),
    removeLevel: (id) => updateSelected((old) => {
      const target = old.plan.levels.find((level) => level.id === id)
      return {
        ...old, plan: { ...old.plan, levels: old.plan.levels.filter((level) => level.id !== id) },
        history: target ? [activity('LEVEL', `${target.direction} level removed`, target.price, 'Removed'), ...old.history] : old.history,
      }
    }),
    updateLevel: (id, patch) => updateSelected((old) => ({
      ...old, plan: { ...old.plan, levels: old.plan.levels.map((level) => level.id === id ? { ...level, ...patch } : level) },
    })),
    setMonitoring: (monitoring) => updateSelected((old) => ({
      ...old, monitoring,
      history: [activity('MONITORING', `Monitoring ${monitoring ? 'enabled' : 'disabled'}`, old.price, monitoring ? 'On' : 'Off'), ...old.history],
      lastStatusUpdate: new Date().toISOString(),
    })),
    addTestAlert: () => updateSelected((old) => ({
      ...old,
      alerts: [{ id: crypto.randomUUID(), time: currentTime(), type: 'TEST', message: `Test alert at ${old.config.symbol} ${old.price.toFixed(old.config.priceDecimals)}`, status: 'Sent' }, ...old.alerts],
    })),
    clearAlerts: () => updateSelected((old) => ({ ...old, alerts: [] })),
    updateOrb: (patch) => updateSelected((old) => ({ ...old, orb: { ...old.orb, ...patch } })),
    resetOrb: () => updateSelected((old) => {
      const fallback = createDefaultInstrumentState(old.config)
      return { ...old, orb: fallback.orb, history: [activity('ORB', 'ORB mock state reset', old.price, 'Reset'), ...old.history] }
    }),
    updateManipulation: (patch) => updateSelected((old) => ({
      ...old, manipulation: { ...old.manipulation, ...patch },
      history: [activity('MANIPULATION', 'Manipulation mock state changed', old.price, 'Mock'), ...old.history],
    })),
    resetManipulation: () => updateSelected((old) => ({ ...old, manipulation: createDefaultInstrumentState(old.config).manipulation })),
    updateStructure: (patch) => updateSelected((old) => ({ ...old, structure: { ...old.structure, ...patch } })),
    addZone: () => updateSelected((old) => {
      const zone: StructureZone = {
        id: crypto.randomUUID(), label: 'New zone', type: 'Support', timeframe: '4H',
        upperPrice: old.price + old.config.defaultApproachDistance,
        lowerPrice: old.price - old.config.defaultApproachDistance,
        enabled: true, notes: '',
      }
      return {
        ...old, structure: { ...old.structure, zones: [...old.structure.zones, zone] },
        history: [activity('STRUCTURE', 'Structure zone added', old.price, 'Added'), ...old.history],
      }
    }),
    updateZone: (id, patch) => updateSelected((old) => ({
      ...old, structure: { ...old.structure, zones: old.structure.zones.map((zone) => zone.id === id ? { ...zone, ...patch } : zone) },
    })),
    removeZone: (id) => updateSelected((old) => ({
      ...old, structure: { ...old.structure, zones: old.structure.zones.filter((zone) => zone.id !== id) },
      history: [activity('STRUCTURE', 'Structure zone removed', old.price, 'Removed'), ...old.history],
    })),
    clearHistory: () => updateSelected((old) => ({ ...old, history: [] })),
  }

  const value: InstrumentContextValue = (() => {
    const instruments = Object.values(store.instruments)
    const current = store.instruments[selectedSymbol] ?? store.instruments.XAUUSD ?? instruments[0]
    return {
      store,
      instruments,
      selectedSymbol: current.config.symbol,
      current,
      selectInstrument: (symbol) => {
        const normalized = symbol.toUpperCase()
        if (!store.instruments[normalized]) return false
        setSelectedSymbol(normalized)
        return true
      },
      getInstrumentState: (symbol) => store.instruments[symbol.toUpperCase()],
      addInstrument: (config) => {
        if (store.instruments[config.symbol]) return false
        setStore((old) => {
          const state = createDefaultInstrumentState(config)
          state.history = [activity('SYSTEM', `Instrument ${config.symbol} added`, state.price, 'Added')]
          return {
            ...old,
            instruments: { ...old.instruments, [config.symbol]: state },
            adminHistory: [activity('SYSTEM', `Instrument ${config.symbol} added`, null, 'Added'), ...old.adminHistory],
          }
        })
        return true
      },
      updateInstrument: (symbol, patch) => setStore((old) => {
        const state = old.instruments[symbol]
        if (!state) return old
        const config = { ...state.config, ...patch, symbol: state.config.symbol, id: state.config.id, updatedAt: new Date().toISOString() }
        const monitoringDisabled = patch.enabled === false
        const event = patch.workspaceEnabled !== undefined && patch.workspaceEnabled !== state.config.workspaceEnabled
          ? `Workspace ${patch.workspaceEnabled ? 'enabled' : 'disabled'}`
          : patch.enabled !== undefined && patch.enabled !== state.config.enabled
            ? `Instrument ${patch.enabled ? 'enabled' : 'disabled'}`
            : 'Instrument configuration edited'
        return {
          ...old,
          instruments: {
            ...old.instruments,
            [symbol]: {
              ...state,
              config,
              monitoring: monitoringDisabled ? false : state.monitoring,
              history: [activity('SYSTEM', event, state.price, 'Updated'), ...state.history],
            },
          },
          adminHistory: [activity('SYSTEM', `${symbol}: ${event}`, null, 'Updated'), ...old.adminHistory],
        }
      }),
      setInstrumentMonitoring: (symbol, monitoring) => setStore((old) => {
        const state = old.instruments[symbol]
        if (!state) return old
        return {
          ...old,
          instruments: {
            ...old.instruments,
            [symbol]: {
              ...state,
              monitoring,
              history: [activity('MONITORING', `Monitoring ${monitoring ? 'enabled' : 'disabled'}`, state.price, monitoring ? 'On' : 'Off'), ...state.history],
            },
          },
          adminHistory: [activity('SYSTEM', `${symbol} monitoring ${monitoring ? 'enabled' : 'disabled'}`, null, monitoring ? 'On' : 'Off'), ...old.adminHistory],
        }
      }),
      removeInstrument: (symbol) => {
        if (symbol === 'XAUUSD' || !store.instruments[symbol]) return false
        setStore((old) => {
          const instruments = { ...old.instruments }
          delete instruments[symbol]
          return {
            ...old,
            instruments,
            adminHistory: [activity('SYSTEM', `Instrument ${symbol} removed`, null, 'Removed'), ...old.adminHistory],
          }
        })
        if (selectedSymbol === symbol) setSelectedSymbol('XAUUSD')
        return true
      },
      replaceStore: (next) => {
        setStore(next)
        if (!next.instruments[selectedSymbol]) setSelectedSymbol('XAUUSD')
      },
      actions,
    }
  })()

  return <InstrumentContext.Provider value={value}>{children}</InstrumentContext.Provider>
}

export function useInstrumentStore() {
  const context = useContext(InstrumentContext)
  if (!context) throw new Error('useInstrumentStore must be used inside InstrumentProvider')
  return context
}

export function useInstrumentWorkspace() {
  const context = useInstrumentStore()
  return { ...context.current, ...context.actions }
}
