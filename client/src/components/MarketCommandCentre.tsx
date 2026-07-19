import { useEffect, useMemo, useRef, useState } from 'react'
import { useInstrumentStore } from '../context/InstrumentContext'
import { useInstrumentQueue } from '../hooks/useInstrumentQueue'
import type { InstrumentStatus } from '../types'
import type { AlertReadyInstrumentState, PriorityFilter } from '../types/instrumentPriority'
import {
  groupInstrumentQueue, matchesPriorityFilter, priorityGroupOrder,
} from '../utils/instrumentPriority'
import { statusTone } from '../utils/trading'
import { StatusBadge } from './Chrome'

const COLLAPSE_STORAGE_KEY = 'deck-priority-groups-v1'

const defaultCollapsed: Record<InstrumentStatus, boolean> = {
  'ACTION REQUIRED': false,
  APPROACHING: false,
  WATCH: false,
  WAITING: true,
  'SESSION CLOSED': true,
  'MONITORING OFF': true,
}

const filterOptions: { value: PriorityFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'ACTION_REQUIRED', label: 'Action Required' },
  { value: 'APPROACHING', label: 'Approaching' },
  { value: 'WATCH', label: 'Watch' },
  { value: 'WAITING', label: 'Waiting' },
  { value: 'SESSION_CLOSED', label: 'Session Closed' },
  { value: 'MONITORING_OFF', label: 'Monitoring Off' },
]

function shortSessionLabel(instrument: AlertReadyInstrumentState) {
  const state = instrument.session.state
  if (state === 'OPEN') return `${instrument.session.name} Open`
  if (state === 'CLOSING_SOON') return `${instrument.session.name} Closing Soon`
  if (state === 'OPENING_SOON') return `${instrument.session.name} Opens Soon`
  return `${instrument.session.name} Closed`
}

function shortNextAction(instrument: AlertReadyInstrumentState) {
  const direction = instrument.triggerDirection === 'Sell' ? 'bearish' : 'bullish'
  if (['ACTION_REQUIRED', 'WATCH_M1', 'IN_ENTRY_ZONE'].includes(instrument.signal)) {
    return `Watch M1 for ${direction} confirmation`
  }
  if (instrument.signal === 'APPROACHING') return `Prepare to open ${instrument.relevantCandle.timeframe}`
  if (instrument.signal === 'BREAKOUT_DETECTED') return 'Waiting for breakout confirmation'
  if (instrument.signal === 'RECLAIM_CONFIRMED') return 'Watch lower timeframe'
  if (instrument.signal === 'MONITORING_OFF') return 'Monitoring off'
  if (instrument.signal === 'SESSION_CLOSED') return 'Session closed'
  if (instrument.signal === 'MONITORING' && instrument.strategies.some((strategy) => strategy.status.toLowerCase().includes('range'))) {
    return 'Waiting for breakout'
  }
  return 'Continue monitoring'
}

function triggerLabel(instrument: AlertReadyInstrumentState) {
  if (instrument.triggerLevel === null) return 'None'
  return `${instrument.triggerDirection ?? 'Level'} ${instrument.triggerLevel.toFixed(instrument.instrument.precision)}`
}

function WatchlistRow({ instrument, onOpenInstrument }: {
  instrument: AlertReadyInstrumentState
  onOpenInstrument: (symbol: string) => void
}) {
  const configured = instrument.instrument.workspace !== null
  const open = () => { if (configured) onOpenInstrument(instrument.instrument.symbol) }

  return (
    <div
      className={`watchlist-row row-${statusTone(instrument.status)} ${configured ? 'configured' : 'unconfigured'}`}
      role={configured ? 'button' : undefined}
      tabIndex={configured ? 0 : undefined}
      onClick={open}
      onKeyDown={(event) => {
        if (configured && (event.key === 'Enter' || event.key === ' ')) open()
      }}
    >
      <div className="watch-instrument">
        <strong>{instrument.instrument.symbol}</strong>
        <span>{instrument.instrument.name}</span>
      </div>
      <div className="watch-priority numeric" data-column="priority">{instrument.score}</div>
      <div className="watch-status"><StatusBadge tone={statusTone(instrument.status)}>{instrument.status}</StatusBadge></div>
      <div className="watch-action">{shortNextAction(instrument)}</div>
      <div className="watch-trigger">{triggerLabel(instrument)}</div>
      <div className="watch-distance numeric">{instrument.distance === null ? '—' : instrument.distance.toFixed(instrument.instrument.precision)}</div>
      <div className="watch-session" data-column="session">{shortSessionLabel(instrument)}</div>
      <div className="watch-price numeric" data-column="price">{instrument.price.toFixed(instrument.instrument.precision)}</div>
      <div className="watch-open">
        {configured
          ? <button onClick={(event) => { event.stopPropagation(); open() }}>Open <span>→</span></button>
          : <span>Not configured</span>}
      </div>
    </div>
  )
}

function WatchlistColumns() {
  return (
    <div className="watchlist-columns" aria-hidden="true">
      <span>Instrument</span>
      <span data-column="priority">Priority</span>
      <span>Status</span>
      <span>Next action</span>
      <span>Trigger / level</span>
      <span>Distance</span>
      <span data-column="session">Session</span>
      <span data-column="price">Price</span>
      <span>Open</span>
    </div>
  )
}

export function MarketCommandCentre({ onOpenInstrument }: { onOpenInstrument: (symbol: string) => void }) {
  const queue = useInstrumentQueue()
  const { instruments: storedInstruments } = useInstrumentStore()
  const masterMonitoring = storedInstruments.filter((item) => item.config.enabled).some((item) => item.monitoring)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<PriorityFilter>('ALL')
  const [configuredOnly, setConfiguredOnly] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<InstrumentStatus, boolean>>(() => {
    try { return { ...defaultCollapsed, ...JSON.parse(localStorage.getItem(COLLAPSE_STORAGE_KEY) ?? '{}') } }
    catch { return defaultCollapsed }
  })
  const previousStatuses = useRef<Record<string, InstrumentStatus>>({})
  const groupRefs = useRef<Partial<Record<InstrumentStatus, HTMLElement | null>>>({})

  useEffect(() => {
    localStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify(collapsed))
  }, [collapsed])

  useEffect(() => {
    const promotedStatuses = new Set<InstrumentStatus>()
    queue.forEach((instrument) => {
      const previous = previousStatuses.current[instrument.instrument.id]
      if (previous && priorityGroupOrder.indexOf(instrument.status) < priorityGroupOrder.indexOf(previous)) {
        promotedStatuses.add(instrument.status)
      }
    })
    if (promotedStatuses.size) {
      setCollapsed((current) => {
        const next = { ...current }
        promotedStatuses.forEach((status) => { next[status] = false })
        return next
      })
    }
    previousStatuses.current = Object.fromEntries(queue.map((instrument) => [instrument.instrument.id, instrument.status]))
  }, [queue])

  const visibleQueue = useMemo(() => {
    const search = query.trim().toLowerCase()
    return queue.filter((instrument) =>
      matchesPriorityFilter(instrument, filter) &&
      (!configuredOnly || instrument.instrument.workspace !== null) &&
      (!search || instrument.instrument.symbol.toLowerCase().includes(search) ||
        instrument.instrument.name.toLowerCase().includes(search)))
  }, [configuredOnly, filter, query, queue])
  const allGroups = useMemo(() => groupInstrumentQueue(queue), [queue])
  const visibleGroups = useMemo(() => groupInstrumentQueue(visibleQueue), [visibleQueue])

  const revealGroup = (status: InstrumentStatus) => {
    setQuery('')
    setFilter('ALL')
    setConfiguredOnly(false)
    setCollapsed((current) => ({ ...current, [status]: false }))
    window.requestAnimationFrame(() => groupRefs.current[status]?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  const summaryItems: { status: InstrumentStatus; label: string }[] = [
    { status: 'ACTION REQUIRED', label: 'Action Required' },
    { status: 'APPROACHING', label: 'Approaching' },
    { status: 'WATCH', label: 'Watch' },
    { status: 'WAITING', label: 'Waiting' },
  ]

  return (
    <main className="content command-centre">
      <div className="command-header">
        <div><span>Market Overview</span><h1>Ranked instrument watchlist</h1></div>
        <div className="command-stats">
          {summaryItems.map((item) => (
            <button onClick={() => revealGroup(item.status)} key={item.status}>
              <strong>{allGroups[item.status].length}</strong><span>{item.label}</span>
            </button>
          ))}
          <div><StatusBadge tone={masterMonitoring ? 'positive' : 'danger'}>{masterMonitoring ? 'On' : 'Off'}</StatusBadge><span>Master monitoring</span></div>
        </div>
      </div>

      <div className="queue-controls">
        <label className="queue-search"><span className="sr-only">Search markets</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search symbol or instrument" /></label>
        <label className="queue-filter"><span className="sr-only">Filter status</span><select value={filter} onChange={(event) => setFilter(event.target.value as PriorityFilter)}>{filterOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
        <label className="configured-toggle"><input type="checkbox" checked={configuredOnly} onChange={(event) => setConfiguredOnly(event.target.checked)} />Configured workspaces only</label>
        <small>{visibleQueue.length} of {queue.length}</small>
      </div>

      <WatchlistColumns />
      <div className="priority-queue">
        {priorityGroupOrder.map((status) => {
          const instruments = visibleGroups[status]
          const totalCount = allGroups[status].length
          if (!totalCount || (!instruments.length && (query || filter !== 'ALL' || configuredOnly))) return null
          const alwaysExpanded = status === 'ACTION REQUIRED'
          const isCollapsed = alwaysExpanded ? false : collapsed[status]
          const displayCount = query || filter !== 'ALL' || configuredOnly ? instruments.length : totalCount
          return (
            <section className={`priority-group group-${status.toLowerCase().replaceAll(' ', '-')}`} ref={(node) => { groupRefs.current[status] = node }} key={status}>
              <button className="priority-group-heading" onClick={() => !alwaysExpanded && setCollapsed((current) => ({ ...current, [status]: !current[status] }))}>
                <span><i className={`group-dot tone-${statusTone(status)}`} />{status}</span>
                <strong>{displayCount}</strong>
                {!alwaysExpanded && <small>{isCollapsed ? 'Expand' : 'Collapse'}</small>}
              </button>
              {!isCollapsed && <div className="watchlist-rows">{instruments.map((instrument) => <WatchlistRow instrument={instrument} onOpenInstrument={onOpenInstrument} key={instrument.instrument.id} />)}</div>}
            </section>
          )
        })}
        {visibleQueue.length === 0 && <div className="queue-empty">No instruments match the current watchlist filters.</div>}
      </div>
    </main>
  )
}
