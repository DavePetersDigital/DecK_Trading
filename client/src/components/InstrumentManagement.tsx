import { useRef, useState } from 'react'
import { categoryDefaults, createInstrumentConfiguration } from '../config/instrumentRegistry'
import { useInstrumentStore } from '../context/InstrumentContext'
import { createInitialInstrumentStore, INSTRUMENT_STORE_KEY } from '../services/instrumentStore'
import type {
  InstrumentCategory, InstrumentConfiguration, InstrumentStoreState, InstrumentWorkspaceState,
} from '../types'
import type { SessionId } from '../types/session'
import { Card, Toggle } from './Cards'
import { StatusBadge } from './Chrome'

const categories: InstrumentCategory[] = ['Metal', 'Forex', 'Index', 'Energy', 'Crypto', 'Other']
const sessionOptions: { id: SessionId; label: string }[] = [
  { id: 'tokyo', label: 'Tokyo' },
  { id: 'london', label: 'London' },
  { id: 'newYork', label: 'New York' },
]

function newConfiguration(): InstrumentConfiguration {
  return createInstrumentConfiguration({
    symbol: '',
    displayName: '',
    shortName: '',
    category: 'Other',
    enabled: true,
    workspaceEnabled: true,
    strategies: { dailyPlan: true, orb: false, structure: true, manipulation: false },
  })
}

function sessionsLabel(sessions: InstrumentConfiguration['monitoredSessions']) {
  if (sessions.length === sessionOptions.length) return 'All sessions'
  return sessions.map((session) => sessionOptions.find((option) => option.id === session)?.label ?? session).join(' · ')
}

function InstrumentForm({ editing, onClose }: { editing?: InstrumentWorkspaceState; onClose: () => void }) {
  const store = useInstrumentStore()
  const [config, setConfig] = useState<InstrumentConfiguration>(() => editing ? structuredClone(editing.config) : newConfiguration())
  const [monitoring, setMonitoring] = useState(editing?.monitoring ?? true)
  const [error, setError] = useState('')
  const patch = (change: Partial<InstrumentConfiguration>) => setConfig((old) => ({ ...old, ...change }))
  const numeric = (key: keyof InstrumentConfiguration, value: string) => patch({ [key]: Number(value) })
  const toggleMonitoredSession = (session: SessionId, enabled: boolean) => setConfig((old) => ({
    ...old,
    monitoredSessions: enabled
      ? [...new Set([...old.monitoredSessions, session])]
      : old.monitoredSessions.filter((item) => item !== session),
    strategySessions: enabled ? old.strategySessions : {
      orb: old.strategySessions.orb.filter((item) => item !== session),
      manipulation: old.strategySessions.manipulation.filter((item) => item !== session),
    },
  }))

  const save = () => {
    const symbol = config.symbol.trim().toUpperCase()
    if (!symbol || !/^[A-Z0-9._-]+$/.test(symbol)) return setError('Enter a valid symbol using letters, numbers, dots, dashes or underscores.')
    if (!config.displayName.trim() || !config.shortName.trim()) return setError('Display name and short name are required.')
    if (!editing && store.getInstrumentState(symbol)) return setError(`${symbol} already exists.`)
    if (!config.monitoredSessions.length) return setError('Select at least one monitored session.')
    if (config.strategies.orb && !config.strategySessions.orb.length) return setError('Select an ORB session or disable the ORB strategy.')
    if (config.strategies.manipulation && !config.strategySessions.manipulation.length) return setError('Select a Manipulation session or disable that strategy.')
    const validNumbers = Number.isInteger(config.priceDecimals) && config.priceDecimals >= 0 && config.priceDecimals <= 8 &&
      [config.pipSize, config.pointSize, config.priceStep].every((value) => Number.isFinite(value) && value > 0) &&
      [config.defaultApproachDistance, config.defaultEntryTolerance].every((value) => Number.isFinite(value) && value >= 0)
    if (!validNumbers) return setError('Check price decimals and numeric instrument values.')
    const next = createInstrumentConfiguration({ ...config, symbol })
    if (editing) {
      store.updateInstrument(editing.config.symbol, next)
      store.setInstrumentMonitoring(editing.config.symbol, monitoring && next.enabled)
    } else {
      store.addInstrument(next)
      if (!monitoring) store.setInstrumentMonitoring(next.symbol, false)
    }
    onClose()
  }

  return (
    <div className="plan-import-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="instrument-form-modal" role="dialog" aria-modal="true" aria-labelledby="instrument-form-title">
        <header><div><span>Instrument registry</span><h2 id="instrument-form-title">{editing ? `Edit ${editing.config.symbol}` : 'Add Instrument'}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close instrument form">×</button></header>
        <div className="instrument-form-grid">
          <label>Symbol<input autoFocus={!editing} value={config.symbol} disabled={Boolean(editing)} onChange={(event) => patch({ symbol: event.target.value.toUpperCase() })} />{editing && <small>Symbol is immutable in this version.</small>}</label>
          <label>Display name<input value={config.displayName} onChange={(event) => patch({ displayName: event.target.value })} /></label>
          <label>Short name<input value={config.shortName} onChange={(event) => patch({ shortName: event.target.value })} /></label>
          <label>Category<select value={config.category} onChange={(event) => {
            const category = event.target.value as InstrumentCategory
            patch({ category, ...categoryDefaults[category] })
          }}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
          <fieldset className="monitored-session-selector"><legend>Monitored sessions</legend>{sessionOptions.map((session) => <label key={session.id}><input type="checkbox" checked={config.monitoredSessions.includes(session.id)} onChange={(event) => toggleMonitoredSession(session.id, event.target.checked)} />{session.label}</label>)}</fieldset>
          {config.strategies.orb && <label>ORB session<select value={config.strategySessions.orb[0] ?? ''} onChange={(event) => patch({ strategySessions: { ...config.strategySessions, orb: event.target.value ? [event.target.value as SessionId] : [] } })}><option value="">Select session</option>{sessionOptions.filter((session) => config.monitoredSessions.includes(session.id)).map((session) => <option value={session.id} key={session.id}>{session.label}</option>)}</select></label>}
          {config.strategies.manipulation && <label>Manipulation session<select value={config.strategySessions.manipulation[0] ?? ''} onChange={(event) => patch({ strategySessions: { ...config.strategySessions, manipulation: event.target.value ? [event.target.value as SessionId] : [] } })}><option value="">Select session</option>{sessionOptions.filter((session) => config.monitoredSessions.includes(session.id)).map((session) => <option value={session.id} key={session.id}>{session.label}</option>)}</select></label>}
          <label>Price decimals<input type="number" min="0" max="8" step="1" value={config.priceDecimals} onChange={(event) => numeric('priceDecimals', event.target.value)} /></label>
          <label>Pip size<input type="number" min="0" step="any" value={config.pipSize} onChange={(event) => numeric('pipSize', event.target.value)} /></label>
          <label>Point size<input type="number" min="0" step="any" value={config.pointSize} onChange={(event) => numeric('pointSize', event.target.value)} /></label>
          <label>Price step<input type="number" min="0" step="any" value={config.priceStep} onChange={(event) => numeric('priceStep', event.target.value)} /></label>
          <label>Default approach distance<input type="number" min="0" step="any" value={config.defaultApproachDistance} onChange={(event) => numeric('defaultApproachDistance', event.target.value)} /></label>
          <label>Default entry tolerance<input type="number" min="0" step="any" value={config.defaultEntryTolerance} onChange={(event) => numeric('defaultEntryTolerance', event.target.value)} /></label>
          <label>cTrader symbol name<input value={config.ctraderSymbolName ?? ''} placeholder="Optional — configure later" onChange={(event) => patch({ ctraderSymbolName: event.target.value })} /></label>
        </div>
        <div className="instrument-form-options">
          <fieldset><legend>Strategies</legend>{([
            ['dailyPlan', 'Daily Plan'], ['orb', 'ORB'], ['structure', 'Structure'], ['manipulation', 'Manipulation'],
          ] as const).map(([key, label]) => <label key={key}><input type="checkbox" checked={config.strategies[key]} onChange={(event) => patch({ strategies: { ...config.strategies, [key]: event.target.checked } })} />{label}</label>)}</fieldset>
          <div className="instrument-form-toggles">
            <label><span><strong>Instrument enabled</strong><small>Disabled instruments stay stored but leave active views.</small></span><Toggle checked={config.enabled} onChange={(enabled) => patch({ enabled })} label="Instrument enabled" /></label>
            <label><span><strong>Workspace enabled</strong><small>Controls sidebar and workspace navigation.</small></span><Toggle checked={config.workspaceEnabled} onChange={(workspaceEnabled) => patch({ workspaceEnabled })} label="Workspace enabled" /></label>
            <label><span><strong>Monitoring enabled</strong><small>Controls local strategy monitoring.</small></span><Toggle checked={monitoring} onChange={setMonitoring} label="Monitoring enabled" /></label>
          </div>
        </div>
        {error && <div className="import-message import-message--danger"><span>{error}</span></div>}
        <div className="plan-import-actions"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" onClick={save}>{editing ? 'Save Changes' : 'Add Instrument'}</button></div>
      </section>
    </div>
  )
}

export function InstrumentManagement() {
  const store = useInstrumentStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [editing, setEditing] = useState<InstrumentWorkspaceState | null | 'new'>(null)
  const [importPreview, setImportPreview] = useState<InstrumentStoreState | null>(null)

  const remove = (instrument: InstrumentWorkspaceState) => {
    if (instrument.config.symbol === 'XAUUSD') return
    const confirmed = window.confirm(`Remove ${instrument.config.symbol}?\n\nThis permanently deletes its local planned levels, structure zones, strategy state and activity history.`)
    if (confirmed) store.removeInstrument(instrument.config.symbol)
  }
  const exportInstruments = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(store.store, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'deck-instruments.json'
    link.click()
    URL.revokeObjectURL(url)
  }
  const previewImport = async (file?: File) => {
    if (!file) return
    try {
      const raw = JSON.parse(await file.text()) as unknown
      if (!raw || typeof raw !== 'object' || !('instruments' in raw)) throw new Error('Invalid registry')
      const preview = createInitialInstrumentStore({
        getItem: (key) => key === INSTRUMENT_STORE_KEY ? JSON.stringify(raw) : null,
      })
      setImportPreview(preview)
    } catch {
      window.alert('This instrument backup is not valid.')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <>
      <Card title="Instrument Management" eyebrow="Shared registry" className="instrument-management" action={<button className="primary" onClick={() => setEditing('new')}>+ Add Instrument</button>}>
        <div className="instrument-management-tools">
          <p>Workspaces, monitoring and strategy availability update across the sidebar and Market Overview immediately.</p>
          <div><button className="secondary" onClick={exportInstruments}>Export Instruments</button><button className="secondary" onClick={() => fileRef.current?.click()}>Import Instruments</button><input ref={fileRef} className="hidden-input" type="file" accept=".json,application/json" onChange={(event) => void previewImport(event.target.files?.[0])} /></div>
        </div>
        <div className="instrument-table">
          <div className="instrument-table-head"><span>Symbol</span><span>Name</span><span>Category</span><span>Monitored Sessions</span><span>Strategies</span><span>Workspace Enabled</span><span>Monitoring Enabled</span><span>Edit</span><span>Remove</span></div>
          {store.instruments.sort((left, right) => left.config.symbol.localeCompare(right.config.symbol)).map((instrument) => {
            const strategies = Object.entries(instrument.config.strategies).filter(([, enabled]) => enabled).map(([name]) => name === 'dailyPlan' ? 'Daily Plan' : name[0].toUpperCase() + name.slice(1))
            return <div className={`instrument-table-row ${instrument.config.enabled ? '' : 'disabled'}`} key={instrument.config.symbol}>
              <strong>{instrument.config.symbol}</strong>
              <span>{instrument.config.displayName}{!instrument.config.enabled && <StatusBadge>Disabled</StatusBadge>}</span>
              <span>{instrument.config.category}</span>
              <span>{sessionsLabel(instrument.config.monitoredSessions)}</span>
              <span className="instrument-strategy-list">{strategies.length ? strategies.join(' · ') : 'None'}</span>
              <Toggle checked={instrument.config.workspaceEnabled} onChange={(workspaceEnabled) => store.updateInstrument(instrument.config.symbol, { workspaceEnabled })} label={`${instrument.config.symbol} workspace`} />
              <Toggle checked={instrument.monitoring} onChange={(enabled) => store.setInstrumentMonitoring(instrument.config.symbol, enabled)} label={`${instrument.config.symbol} monitoring`} />
              <button className="secondary compact-button" onClick={() => setEditing(instrument)}>Edit</button>
              {instrument.config.symbol === 'XAUUSD' ? <span className="protected-label">Protected</span> : <button className="secondary compact-button danger-text" onClick={() => remove(instrument)}>Remove</button>}
            </div>
          })}
        </div>
        {importPreview && <div className="instrument-import-preview"><div><strong>Import preview</strong><span>{Object.keys(importPreview.instruments).length} instruments will replace the current local registry and workspace data.</span></div><div><button className="secondary" onClick={() => setImportPreview(null)}>Cancel</button><button className="primary" onClick={() => { store.replaceStore(importPreview); setImportPreview(null) }}>Apply Import</button></div></div>}
      </Card>
      {editing && <InstrumentForm editing={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  )
}
