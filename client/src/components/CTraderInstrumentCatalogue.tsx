import { useEffect, useMemo, useState } from 'react'
import { createInstrumentConfiguration } from '../config/instrumentRegistry'
import { useInstrumentStore } from '../context/InstrumentContext'
import { fetchCTraderSymbols, type CTraderSymbol } from '../services/ctraderApi'
import {
  guessDisplayName,
  guessInstrumentCategory,
  guessShortName,
  normalizeCTraderSymbolName,
  parseCTraderSymbolId,
} from '../utils/ctraderInstrumentMapping'
import { StatusBadge } from './Chrome'

interface CatalogueProps {
  connected: boolean
}

export function CTraderInstrumentCatalogue({ connected }: CatalogueProps) {
  const store = useInstrumentStore()
  const [expanded, setExpanded] = useState(false)
  const [symbols, setSymbols] = useState<CTraderSymbol[]>([])
  const [query, setQuery] = useState('')
  const [enabledOnly, setEnabledOnly] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const loadSymbols = async () => {
    if (!connected) {
      setSymbols([])
      setError('Connect cTrader to load the instrument catalogue.')
      return
    }
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const discovery = await fetchCTraderSymbols()
      setSymbols(discovery.symbols ?? [])
      setMessage(`${discovery.symbols?.length ?? 0} symbols loaded from cTrader.`)
    } catch (loadError) {
      setSymbols([])
      setError(loadError instanceof Error ? loadError.message : 'Failed to load cTrader symbols.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!expanded) return
    void loadSymbols()
  }, [connected, expanded])

  const watchlistSymbols = useMemo(
    () => new Set(
      store.instruments
        .filter((instrument) => instrument.config.enabled && instrument.config.workspaceEnabled)
        .map((instrument) => instrument.config.symbol),
    ),
    [store.instruments],
  )

  const filtered = useMemo(() => {
    const needle = query.trim().toUpperCase()
    return symbols
      .filter((symbol) => (!enabledOnly || symbol.enabled))
      .filter((symbol) => {
        if (!needle) return true
        return symbol.symbolName.toUpperCase().includes(needle) || symbol.symbolId.includes(needle)
      })
      .sort((left, right) => left.symbolName.localeCompare(right.symbolName))
  }, [symbols, query, enabledOnly])

  const addToWatchlist = (symbol: CTraderSymbol) => {
    const normalized = normalizeCTraderSymbolName(symbol.symbolName)
    if (!normalized || !/^[A-Z0-9._-]+$/.test(normalized)) {
      setError(`Cannot add ${symbol.symbolName}: unsupported symbol format.`)
      return
    }

    const category = guessInstrumentCategory(normalized)
    const ctraderSymbolId = parseCTraderSymbolId(symbol.symbolId)
    const existing = store.getInstrumentState(normalized)

    if (existing) {
      store.updateInstrument(normalized, {
        enabled: true,
        workspaceEnabled: true,
        ctraderSymbolId: ctraderSymbolId ?? existing.config.ctraderSymbolId,
        ctraderSymbolName: symbol.symbolName,
      })
      setMessage(`${normalized} updated and added to the sidebar watchlist.`)
      return
    }

    store.addInstrument(createInstrumentConfiguration({
      symbol: normalized,
      displayName: guessDisplayName(normalized),
      shortName: guessShortName(normalized),
      category,
      enabled: true,
      workspaceEnabled: true,
      ctraderSymbolId,
      ctraderSymbolName: symbol.symbolName,
      strategies: { dailyPlan: true, orb: false, structure: true, manipulation: false },
    }))
    setMessage(`${normalized} added to the sidebar watchlist.`)
  }

  const removeFromWatchlist = (symbolName: string) => {
    const normalized = normalizeCTraderSymbolName(symbolName)
    const existing = store.getInstrumentState(normalized)
    if (!existing) return
    store.updateInstrument(normalized, { workspaceEnabled: false })
    setMessage(`${normalized} removed from the sidebar watchlist.`)
  }

  return (
    <section className={`card instrument-catalogue ${expanded ? 'is-expanded' : 'is-collapsed'}`}>
      <button
        type="button"
        className="card-head catalogue-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <div>
          <span>Broker symbols</span>
          <h2>cTrader Instrument Catalogue</h2>
        </div>
        <span className="catalogue-toggle-meta">
          <small>{expanded ? 'Collapse' : 'Expand'}</small>
          <span className="catalogue-chevron" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
        </span>
      </button>

      {expanded && (
        <>
          <div className="instrument-management-tools">
            <p>Search the full cTrader symbol list, then add selections to your watchlist. Watchlist instruments appear in the sidebar.</p>
            <div className="catalogue-filters">
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search symbol name or id"
                aria-label="Search cTrader symbols"
                disabled={!connected}
              />
              <label className="catalogue-enabled-filter">
                <input
                  type="checkbox"
                  checked={enabledOnly}
                  onChange={(event) => setEnabledOnly(event.target.checked)}
                  disabled={!connected}
                />
                Enabled only
              </label>
              <button
                className="secondary compact-button"
                disabled={!connected || loading}
                onClick={(event) => {
                  event.stopPropagation()
                  void loadSymbols()
                }}
              >
                {loading ? 'Loading…' : 'Refresh'}
              </button>
            </div>
          </div>

          {!connected && (
            <div className="import-message">
              <span>Connect cTrader above to load symbols into this catalogue.</span>
            </div>
          )}
          {error && <div className="import-message import-message--danger"><span>{error}</span></div>}
          {message && !error && <div className="import-message"><span>{message}</span></div>}

          {connected && (
            <div className="catalogue-table">
              <div className="catalogue-table-head">
                <span>Symbol</span>
                <span>ID</span>
                <span>Status</span>
                <span>Watchlist</span>
                <span>Action</span>
              </div>
              {filtered.slice(0, 200).map((symbol) => {
                const normalized = normalizeCTraderSymbolName(symbol.symbolName)
                const onWatchlist = watchlistSymbols.has(normalized)
                return (
                  <div className="catalogue-table-row" key={`${symbol.symbolId}-${symbol.symbolName}`}>
                    <strong>{symbol.symbolName}</strong>
                    <span className="catalogue-id">{symbol.symbolId}</span>
                    <span>{symbol.enabled ? <StatusBadge tone="positive">Enabled</StatusBadge> : <StatusBadge>Disabled</StatusBadge>}</span>
                    <span>{onWatchlist ? <StatusBadge tone="positive">Sidebar</StatusBadge> : <StatusBadge>Not selected</StatusBadge>}</span>
                    {onWatchlist
                      ? <button className="secondary compact-button" onClick={() => removeFromWatchlist(symbol.symbolName)}>Remove</button>
                      : <button className="primary compact-button" onClick={() => addToWatchlist(symbol)}>Add</button>}
                  </div>
                )
              })}
              {filtered.length === 0 && !loading && (
                <div className="queue-empty">No symbols match the current catalogue filters.</div>
              )}
              {filtered.length > 200 && (
                <div className="catalogue-overflow">Showing first 200 of {filtered.length} matches. Refine your search.</div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  )
}
