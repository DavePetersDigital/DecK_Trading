import { useEffect, useMemo, useState } from 'react'
import { Card } from './Cards'
import { StatusBadge } from './Chrome'
import { ThemeSelector } from './ThemeSelector'
import { fetchOrbEngineState, marketEventLabel, type MarketEvent, type OrbEngineState, type OrbMonitor } from '../services/orbApi'
import { fetchMonitoredInstruments, type MonitoredInstrument } from '../services/monitoredInstrumentsApi'
import { fetchOpeningProfiles, type OpeningProfile } from '../services/openingProfilesApi'
import {
  breakoutLabel,
  displayedBreakoutLabel,
  formatLastAlert,
  isHighlighted,
  isProfileBeingMonitored,
  latestEventAtForMonitor,
  manipulationLabel,
  marketEventManipulationLabel,
  marketStatusForProfile,
  profileMatchesFilter,
  rowTintForMonitor,
  selectDisplayedProfile,
  tradingWindowStatus,
  type InstrumentProfileView,
  type RowHighlightMode,
  type ScannerFilter,
  type ScannerInstrument,
} from '../utils/marketScanner'

const STATE_REFRESH_MS = 5000
const CLOCK_TICK_MS = 1000

type SortKey = 'default' | 'instrument' | 'trend' | 'profile' | 'market' | 'window' | 'manip' | 'm5' | 'm15' | 'alert'

interface AttentionDashboardProps {
  highlightMode?: RowHighlightMode
  onHighlightModeChange?: (mode: RowHighlightMode) => void
}

interface InstrumentRow {
  instrument: ScannerInstrument
  selected: InstrumentProfileView
  displayedM5: ReturnType<typeof displayedBreakoutLabel>
  displayedM15: ReturnType<typeof displayedBreakoutLabel>
  tint: ReturnType<typeof rowTintForMonitor>
  highlighted: boolean
}

function trendFromMonitors(monitors: OrbMonitor[]): 'Bullish' | 'Bearish' | '—' {
  for (const monitor of monitors) {
    if (monitor.trend?.trend === 'bullish') return 'Bullish'
    if (monitor.trend?.trend === 'bearish') return 'Bearish'
  }
  return '—'
}

function buildInstrumentProfileView(
  monitor: OrbMonitor,
  openingProfile: OpeningProfile | null,
  events: MarketEvent[],
  highlightMode: RowHighlightMode,
  now: Date,
): InstrumentProfileView {
  const market = openingProfile
    ? marketStatusForProfile(openingProfile, now)
    : { label: 'Closed' as const, detail: '—', tone: 'grey' as const, isOpen: false, isClosingSoon: false }
  const allowAfter = monitor.allowTradesAfterWindow ?? openingProfile?.allowTradesAfterWindow ?? true
  const windowMinutes = monitor.tradingWindowMinutes ?? openingProfile?.tradingWindowMinutes ?? 120
  const window = tradingWindowStatus(
    monitor.openingInstantUtc,
    monitor.tradingWindowEndUtc,
    windowMinutes,
    allowAfter,
    now,
  )
  const openMs = Date.parse(monitor.openingInstantUtc)
  const endMs = monitor.tradingWindowEndUtc
    ? Date.parse(monitor.tradingWindowEndUtc)
    : openMs + windowMinutes * 60_000
  const nowMs = now.getTime()
  // Extended monitoring only after the trading window has ended (not before open).
  const extendedMonitoring =
    Number.isFinite(endMs) && nowMs > endMs && allowAfter && Number.isFinite(openMs) && nowMs >= openMs

  const beingMonitored = isProfileBeingMonitored({
    marketOpen: market.isOpen,
    tradingWindowOpen: window.isOpen,
    extendedMonitoring,
  })
  const rawTint = rowTintForMonitor(monitor, highlightMode, now)
  const tint = beingMonitored ? rawTint : 'none'
  const hasBreakout =
    breakoutLabel(monitor.m5Breakout) !== 'No Breakout' ||
    breakoutLabel(monitor.m15Breakout) !== 'No Breakout'

  return {
    monitor,
    profileId: monitor.profileId,
    profileName: monitor.profileName,
    market,
    window,
    manip: manipulationLabel(monitor.manipulation),
    m5: breakoutLabel(monitor.m5Breakout),
    m15: breakoutLabel(monitor.m15Breakout),
    tint,
    highlighted: isHighlighted(tint),
    latestAlertAt: latestEventAtForMonitor(monitor, events),
    rank: {
      id: monitor.profileId,
      openingInstantUtc: monitor.openingInstantUtc,
      closingInstantUtc: monitor.closingInstantUtc ?? null,
      marketOpen: market.isOpen,
      tradingWindowOpen: window.isOpen,
      extendedMonitoring,
      hasBreakout,
      secondsToOpen: market.isOpen ? 0 : parseCountdownSeconds(market.detail),
    },
  }
}

/** Parse "Opens in HH:MM:SS" detail into seconds; large fallback when unknown. */
function parseCountdownSeconds(detail: string): number {
  const match = /Opens in (\d{2}):(\d{2}):(\d{2})/.exec(detail)
  if (!match) return Number.MAX_SAFE_INTEGER
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
}

/** Allowed (symbolId → enabled Opening Profile ids) from the Admin registry. */
function enabledProfileIdsBySymbol(instruments: MonitoredInstrument[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>()
  for (const instrument of instruments) {
    if (!instrument.enabled) continue
    map.set(instrument.symbolId, new Set(instrument.openingProfileIds ?? []))
  }
  return map
}

function groupMonitorsIntoInstruments(
  monitors: OrbMonitor[],
  profileById: Map<string, OpeningProfile>,
  enabledBySymbol: Map<string, Set<string>>,
  events: MarketEvent[],
  highlightMode: RowHighlightMode,
  now: Date,
): ScannerInstrument[] {
  // Only keep monitors for profiles currently assigned in Admin.
  const enabledMonitors = monitors.filter((monitor) => {
    const allowed = enabledBySymbol.get(monitor.symbolId)
    if (!allowed) return false
    return allowed.has(monitor.profileId)
  })

  const bySymbol = new Map<string, OrbMonitor[]>()
  for (const monitor of enabledMonitors) {
    const list = bySymbol.get(monitor.symbolId)
    if (list) list.push(monitor)
    else bySymbol.set(monitor.symbolId, [monitor])
  }

  const instruments: ScannerInstrument[] = []
  for (const group of bySymbol.values()) {
    const first = group[0]!
    instruments.push({
      symbolId: first.symbolId,
      symbolName: first.symbolName,
      displayName: first.displayName || first.symbolName,
      trend: trendFromMonitors(group),
      profiles: group.map((monitor) =>
        buildInstrumentProfileView(monitor, profileById.get(monitor.profileId) ?? null, events, highlightMode, now),
      ),
    })
  }
  return instruments
}

export function AttentionDashboard({
  highlightMode = 'qualified',
  onHighlightModeChange,
}: AttentionDashboardProps) {
  const [state, setState] = useState<OrbEngineState | null>(null)
  const [profiles, setProfiles] = useState<OpeningProfile[]>([])
  const [monitored, setMonitored] = useState<MonitoredInstrument[]>([])
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => new Date())
  const [filter, setFilter] = useState<ScannerFilter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('default')
  const [sortAsc, setSortAsc] = useState(true)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const [nextState, nextProfiles, nextMonitored] = await Promise.all([
          fetchOrbEngineState(),
          fetchOpeningProfiles(),
          fetchMonitoredInstruments(),
        ])
        if (!active) return
        setState(nextState)
        setProfiles(nextProfiles)
        setMonitored(nextMonitored)
        setError(null)
      } catch (loadError) {
        if (!active) return
        setError(loadError instanceof Error ? loadError.message : 'Failed to load engine state.')
      }
    }
    void load()
    const timer = window.setInterval(() => void load(), STATE_REFRESH_MS)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), CLOCK_TICK_MS)
    return () => window.clearInterval(timer)
  }, [])

  const profileById = useMemo(
    () => new Map(profiles.map((profile) => [profile.id, profile])),
    [profiles],
  )

  const enabledBySymbol = useMemo(() => enabledProfileIdsBySymbol(monitored), [monitored])

  const monitors = state?.monitors ?? []
  const events = state?.events ?? []

  const rows = useMemo(() => {
    const instruments = groupMonitorsIntoInstruments(
      monitors,
      profileById,
      enabledBySymbol,
      events,
      highlightMode,
      now,
    )

    const built: InstrumentRow[] = []
    for (const instrument of instruments) {
      const anyMatch = instrument.profiles.some((profile) => profileMatchesFilter(profile, filter))
      if (!anyMatch) continue
      const selected = selectDisplayedProfile(instrument, filter)
      if (!selected) continue
      const beingMonitored = isProfileBeingMonitored({
        marketOpen: selected.rank.marketOpen,
        tradingWindowOpen: selected.rank.tradingWindowOpen,
        extendedMonitoring: selected.rank.extendedMonitoring,
      })
      const tint = beingMonitored ? selected.tint : 'none'
      built.push({
        instrument,
        selected,
        displayedM5: displayedBreakoutLabel(beingMonitored, selected.monitor.m5Breakout),
        displayedM15: displayedBreakoutLabel(beingMonitored, selected.monitor.m15Breakout),
        tint,
        highlighted: beingMonitored && isHighlighted(tint),
      })
    }

    const sorted = [...built].sort((a, b) => {
      if (sortKey === 'default') {
        if (a.highlighted !== b.highlighted) return a.highlighted ? -1 : 1
        if (a.selected.window.isOpen !== b.selected.window.isOpen) return a.selected.window.isOpen ? -1 : 1
        if (a.selected.market.isOpen !== b.selected.market.isOpen) return a.selected.market.isOpen ? -1 : 1
        return a.instrument.displayName.localeCompare(b.instrument.displayName)
      }

      const dir = sortAsc ? 1 : -1
      const cmp = (left: string | number, right: string | number) =>
        left < right ? -1 * dir : left > right ? 1 * dir : 0

      switch (sortKey) {
        case 'instrument':
          return cmp(a.instrument.displayName, b.instrument.displayName)
        case 'trend':
          return cmp(a.instrument.trend, b.instrument.trend)
        case 'profile':
          return cmp(a.selected.profileName, b.selected.profileName)
        case 'manip':
          return cmp(a.selected.manip, b.selected.manip)
        case 'm5':
          return cmp(a.displayedM5, b.displayedM5)
        case 'm15':
          return cmp(a.displayedM15, b.displayedM15)
        case 'alert':
          return cmp(a.selected.latestAlertAt ?? '', b.selected.latestAlertAt ?? '')
        case 'market':
          return cmp(a.selected.market.isOpen ? 0 : 1, b.selected.market.isOpen ? 0 : 1)
        case 'window':
          return cmp(a.selected.window.isOpen ? 0 : 1, b.selected.window.isOpen ? 0 : 1)
        default:
          return 0
      }
    })

    return sorted
  }, [monitors, events, profileById, enabledBySymbol, highlightMode, filter, sortKey, sortAsc, now])

  const attentionCount = rows.filter((row) => row.highlighted).length

  const toggleSort = (key: SortKey) => {
    if (key === 'default') {
      setSortKey('default')
      return
    }
    if (sortKey === key) setSortAsc((value) => !value)
    else {
      setSortKey(key)
      setSortAsc(true)
    }
  }

  const breakoutClass = (label: string) => {
    if (label === '—') return 'cleared'
    if (label === 'No Breakout') return 'none'
    if (label === 'Inside ORB') return 'inside'
    return label.includes('High') ? 'high' : 'low'
  }

  const eventToneClass = (event: MarketEvent) => {
    if (event.eventType === 'returned_to_orb') return 'returned'
    if (event.direction === 'bullish') return 'up'
    if (event.direction === 'bearish') return 'down'
    return 'neutral'
  }

  return (
    <main className="content attention-dashboard">
      <div className="command-header">
        <div>
          <span>Market Scanner</span>
        </div>
        <div className="command-stats">
          <div>
            <strong className={attentionCount > 0 ? 'attention-live' : ''}>{attentionCount}</strong>
            <span>Need attention</span>
          </div>
          <div>
            <strong>{rows.length}</strong>
            <span>Instruments</span>
          </div>
          <div>
            <StatusBadge tone={state?.running ? 'positive' : 'danger'}>
              {state?.running ? 'Engine on' : 'Engine off'}
            </StatusBadge>
            <StatusBadge tone={state?.connected ? 'positive' : 'neutral'}>
              {state?.connected ? 'cTrader live' : 'cTrader offline'}
            </StatusBadge>
          </div>
          <ThemeSelector />
        </div>
      </div>

      {error && (
        <div className="attention-error">
          <StatusBadge tone="danger">Engine unavailable</StatusBadge>
          <span>{error}</span>
        </div>
      )}

      <div className="scanner-toolbar">
        <div className="scanner-filters" role="group" aria-label="Scanner filters">
          {(
            [
              ['all', 'All'],
              ['attention', 'Attention only'],
              ['open_markets', 'Open markets'],
              ['active_windows', 'Active windows'],
              ['manipulation', 'Manipulation'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={filter === value ? 'active' : ''}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="scanner-highlight-mode">
          <span>Row highlight</span>
          <select
            value={highlightMode}
            onChange={(event) => onHighlightModeChange?.(event.target.value as RowHighlightMode)}
            disabled={!onHighlightModeChange}
          >
            <option value="qualified">Qualified Breakouts Only</option>
            <option value="any">Any Breakout</option>
            <option value="never">Never Highlight</option>
          </select>
        </label>
      </div>

      <div className="scanner-table-wrap">
        <table className="scanner-table">
          <thead>
            <tr>
              <th className="sticky-col" onClick={() => toggleSort('instrument')}>Instrument</th>
              <th onClick={() => toggleSort('trend')}>Trend</th>
              <th onClick={() => toggleSort('profile')}>Opening Profile</th>
              <th onClick={() => toggleSort('market')}>Market Status</th>
              <th onClick={() => toggleSort('window')}>Trading Window</th>
              <th onClick={() => toggleSort('manip')}>Manipulation</th>
              <th onClick={() => toggleSort('m5')}>M5 Breakout</th>
              <th onClick={() => toggleSort('m15')}>M15 Breakout</th>
              <th onClick={() => toggleSort('alert')}>Last Event</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="scanner-empty">
                  No monitored instruments match the current filter.
                </td>
              </tr>
            ) : (
              rows.map(({ instrument, selected, displayedM5, displayedM15, tint, highlighted }) => (
                <tr
                  key={instrument.symbolName}
                  className={`scanner-row tint-${tint}${highlighted ? ' is-attention' : ''}`}
                >
                  <td className="sticky-col scanner-instrument">
                    <strong>{instrument.displayName}</strong>
                    <span>{instrument.symbolName}</span>
                  </td>
                  <td className={`scanner-trend trend-${instrument.trend === '—' ? 'none' : instrument.trend.toLowerCase()}`}>
                    {instrument.trend}
                  </td>
                  <td>{selected.profileName}</td>
                  <td className={`scanner-clock tone-${selected.market.tone}`}>
                    <strong>{selected.market.label}</strong>
                    <span>{selected.market.detail}</span>
                  </td>
                  <td className={`scanner-clock tone-${selected.window.tone}`}>
                    <strong>{selected.window.label}</strong>
                    <span>{selected.window.detail}</span>
                  </td>
                  <td className={`scanner-manip manip-${selected.manip.toLowerCase()}`}>{selected.manip}</td>
                  <td className={`scanner-breakout breakout-${breakoutClass(displayedM5)}`}>{displayedM5}</td>
                  <td className={`scanner-breakout breakout-${breakoutClass(displayedM15)}`}>{displayedM15}</td>
                  <td className="scanner-alert">{formatLastAlert(selected.latestAlertAt, now)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Card title="Recent Market Events" eyebrow="Market activity" className="attention-alerts">
        {events.length === 0 ? (
          <p className="card-copy">No market events yet.</p>
        ) : (
          <ul className="attention-alert-feed">
            {events.slice(0, 12).map((event) => (
              <li key={event.id}>
                <span className={`orb-alert-dir orb-alert-${eventToneClass(event)}`}>
                  {marketEventLabel(event.eventType)}
                </span>
                <span className="market-event-tf">{event.timeframe}</span>
                <strong>{event.instrumentName || event.symbol}</strong>
                <span className="orb-subtle">{event.openingProfileName}</span>
                <span className="attention-alert-msg">
                  {marketEventManipulationLabel(event.manipulationCategory)}
                </span>
                <time>{formatLastAlert(event.occurredAt, now)}</time>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  )
}
