import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, Toggle } from './Cards'
import { StatusBadge } from './Chrome'
import { fetchCTraderSymbols, type CTraderSymbol } from '../services/ctraderApi'
import {
  createMonitoredInstrument,
  deleteMonitoredInstrument,
  fetchMonitoredInstruments,
  patchMonitoredInstrument,
  type ManipulationMode,
  type MonitoredInstrument,
} from '../services/monitoredInstrumentsApi'
import { fetchOpeningProfiles, type OpeningProfile } from '../services/openingProfilesApi'

interface MonitoredInstrumentRegistryProps {
  connected: boolean
}

function isGold(symbolName: string) {
  return symbolName.trim().toUpperCase() === 'XAUUSD'
}

export function MonitoredInstrumentRegistry({ connected }: MonitoredInstrumentRegistryProps) {
  const [instruments, setInstruments] = useState<MonitoredInstrument[]>([])
  const [profiles, setProfiles] = useState<OpeningProfile[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [adding, setAdding] = useState(false)
  const [symbols, setSymbols] = useState<CTraderSymbol[]>([])
  const [catalogueLoading, setCatalogueLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [busySymbolId, setBusySymbolId] = useState<string | null>(null)

  const loadMonitored = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setInstruments(await fetchMonitoredInstruments())
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load monitored instruments.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadMonitored()
  }, [loadMonitored])

  useEffect(() => {
    let active = true
    fetchOpeningProfiles()
      .then((next) => { if (active) setProfiles(next) })
      .catch(() => { if (active) setProfiles([]) })
    return () => { active = false }
  }, [])

  const loadCatalogue = useCallback(async () => {
    if (!connected) {
      setSymbols([])
      return
    }
    setCatalogueLoading(true)
    try {
      const discovery = await fetchCTraderSymbols()
      setSymbols(discovery.symbols ?? [])
    } catch (catalogueError) {
      setError(catalogueError instanceof Error ? catalogueError.message : 'Failed to load cTrader symbols.')
    } finally {
      setCatalogueLoading(false)
    }
  }, [connected])

  useEffect(() => {
    if (!adding) return
    void loadCatalogue()
  }, [adding, loadCatalogue])

  const monitoredIds = useMemo(
    () => new Set(instruments.map((instrument) => instrument.symbolId)),
    [instruments],
  )

  const filteredSymbols = useMemo(() => {
    const needle = query.trim().toUpperCase()
    return symbols
      .filter((symbol) => !monitoredIds.has(symbol.symbolId))
      .filter((symbol) => {
        if (!needle) return true
        return symbol.symbolName.toUpperCase().includes(needle) || symbol.symbolId.includes(needle)
      })
      .sort((left, right) => left.symbolName.localeCompare(right.symbolName))
      .slice(0, 50)
  }, [symbols, query, monitoredIds])

  const runAction = useCallback(async (symbolId: string, action: () => Promise<void>) => {
    setBusySymbolId(symbolId)
    setError('')
    setMessage('')
    try {
      await action()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'The request could not be completed.')
    } finally {
      setBusySymbolId(null)
    }
  }, [])

  const addInstrument = (symbol: CTraderSymbol) => runAction(symbol.symbolId, async () => {
    const created = await createMonitoredInstrument({
      symbolId: symbol.symbolId,
      symbolName: symbol.symbolName,
      displayName: symbol.symbolName,
    })
    setInstruments((current) => [...current, created])
    setMessage(`${created.symbolName} added to the monitored registry.`)
  })

  const updateInstrument = (
    instrument: MonitoredInstrument,
    patch: Parameters<typeof patchMonitoredInstrument>[1],
  ) => runAction(instrument.symbolId, async () => {
    const updated = await patchMonitoredInstrument(instrument.symbolId, patch)
    setInstruments((current) => current.map((item) => item.symbolId === updated.symbolId ? updated : item))
  })

  const toggleProfile = (instrument: MonitoredInstrument, profileId: string, value: boolean) => {
    const current = instrument.openingProfileIds ?? []
    const next = value
      ? Array.from(new Set([...current, profileId]))
      : current.filter((id) => id !== profileId)
    void updateInstrument(instrument, { openingProfileIds: next })
  }

  const removeInstrument = (instrument: MonitoredInstrument) => runAction(instrument.symbolId, async () => {
    await deleteMonitoredInstrument(instrument.symbolId)
    setInstruments((current) => current.filter((item) => item.symbolId !== instrument.symbolId))
    setMessage(`${instrument.symbolName} removed from the monitored registry.`)
  })

  return (
    <Card
      title="Monitored Instruments"
      eyebrow="ORB monitoring registry"
      className="instrument-management"
      action={(
        <button className="primary" onClick={() => setAdding((value) => !value)} disabled={!connected}>
          {adding ? 'Close' : '+ Add from cTrader'}
        </button>
      )}
    >
      <div className="instrument-management-tools">
        <p>Instruments here are the source of truth for future session ORB breakout monitoring. Selections persist on the server independently of the sidebar watchlist.</p>
        {!connected && <span className="admin-auth-notice">Connect cTrader to add instruments from the broker catalogue.</span>}
      </div>

      {error && <div className="import-message import-message--danger"><span>{error}</span></div>}
      {message && !error && <div className="import-message"><span>{message}</span></div>}

      {adding && connected && (
        <div className="monitored-add-panel">
          <div className="catalogue-filters">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search cTrader symbol name or id"
              aria-label="Search cTrader symbols to monitor"
            />
            <button className="secondary compact-button" onClick={() => void loadCatalogue()} disabled={catalogueLoading}>
              {catalogueLoading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
          <div className="catalogue-table">
            <div className="catalogue-table-head"><span>Symbol</span><span>ID</span><span>Status</span><span>Action</span></div>
            {filteredSymbols.map((symbol) => (
              <div className="catalogue-table-row" key={`${symbol.symbolId}-${symbol.symbolName}`}>
                <strong>{symbol.symbolName}</strong>
                <span className="catalogue-id">{symbol.symbolId}</span>
                <span>{symbol.enabled ? <StatusBadge tone="positive">Enabled</StatusBadge> : <StatusBadge>Disabled</StatusBadge>}</span>
                <button
                  className="primary compact-button"
                  disabled={busySymbolId === symbol.symbolId}
                  onClick={() => void addInstrument(symbol)}
                >
                  {busySymbolId === symbol.symbolId ? 'Adding…' : 'Add'}
                </button>
              </div>
            ))}
            {!catalogueLoading && filteredSymbols.length === 0 && (
              <div className="queue-empty">No unmonitored symbols match the current search.</div>
            )}
          </div>
        </div>
      )}

      <div className="instrument-table monitored-instrument-table">
        <div className="instrument-table-head">
          <span>Instrument</span>
          <span>Symbol</span>
          <span>ID</span>
          <span>Opening Profiles</span>
          <span>Manipulation</span>
          <span>Enabled</span>
          <span>Remove</span>
        </div>
        {loading && instruments.length === 0 && <div className="queue-empty">Loading monitored instruments…</div>}
        {!loading && instruments.length === 0 && <div className="queue-empty">No monitored instruments configured.</div>}
        {instruments.map((instrument) => {
          const gold = isGold(instrument.symbolName)
          const busy = busySymbolId === instrument.symbolId
          return (
            <div className={`instrument-table-row ${instrument.enabled ? '' : 'disabled'}`} key={instrument.symbolId}>
              <strong>{instrument.displayName}</strong>
              <span>{instrument.symbolName}</span>
              <span className="catalogue-id">{instrument.symbolId}</span>
              <span className="monitored-session-toggles">
                {profiles.length === 0 && <span className="orb-subtle">No Opening Profiles defined</span>}
                {profiles.map((profile) => (
                  <label key={profile.id} className="monitored-session-checkbox">
                    <input
                      type="checkbox"
                      checked={(instrument.openingProfileIds ?? []).includes(profile.id)}
                      disabled={busy}
                      onChange={(event) => toggleProfile(instrument, profile.id, event.target.checked)}
                    />
                    {profile.displayName}
                  </label>
                ))}
              </span>
              <span>
                <select
                  aria-label={`${instrument.symbolName} manipulation mode`}
                  value={instrument.manipulationMode}
                  disabled={busy}
                  onChange={(event) => void updateInstrument(instrument, { manipulationMode: event.target.value as ManipulationMode })}
                >
                  <option value="normal">Normal</option>
                  {gold && <option value="gold_specific">Gold specific</option>}
                </select>
              </span>
              <Toggle
                checked={instrument.enabled}
                onChange={(enabled) => void updateInstrument(instrument, { enabled })}
                label={`${instrument.symbolName} monitoring`}
              />
              {gold
                ? <span className="protected-label">Protected</span>
                : (
                  <button
                    className="secondary compact-button danger-text"
                    disabled={busy}
                    onClick={() => void removeInstrument(instrument)}
                  >
                    Remove
                  </button>
                )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}
