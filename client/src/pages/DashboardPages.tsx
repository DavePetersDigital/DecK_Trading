import { useRef } from 'react'
import { AlertsCard, Card, Toggle } from '../components/Cards'
import { StatusBadge } from '../components/Chrome'
import {
  DailyPlanWorkspace, GoldOverview, HistoryWorkspace, InstrumentSummaryCard,
  ManipulationWorkspace, OrbWorkspace, StructureWorkspace,
} from '../components/TradingAssistantPanels'
import { useGold } from '../context/GoldContext'
import { otherInstruments } from '../data/mockData'
import { useGoldInstrument } from '../hooks/useGoldInstrument'
import { useSession } from '../hooks/useSession'
import type { AppSettings, GoldTab, Instrument, InstrumentStatus } from '../types'
import { statusPriority } from '../utils/trading'

export function OverviewPage({ onOpenGold }: { onOpenGold: () => void }) {
  const goldInstrument = useGoldInstrument()
  const session = useSession()
  const sessionStatus = (id: 'tokyo' | 'london' | 'newYork'): InstrumentStatus =>
    session.sessions[id].isActive || session.sessions[id].state === 'OPENING_SOON'
      ? 'WATCH'
      : 'SESSION CLOSED'
  const statuses: InstrumentStatus[] = [sessionStatus('tokyo'), sessionStatus('london'), sessionStatus('newYork')]
  const instruments: Instrument[] = [
    goldInstrument,
    ...otherInstruments.map((instrument, index) => ({ ...instrument, status: statuses[index] })),
  ].sort((a, b) => statusPriority[a.status] - statusPriority[b.status])
  const attention = instruments.filter((instrument) => instrument.status === 'ACTION REQUIRED' || instrument.status === 'WATCH').length
  const approaching = instruments.filter((instrument) => instrument.status === 'APPROACHING').length
  const waiting = instruments.filter((instrument) => instrument.status === 'WAITING' || instrument.status === 'SESSION CLOSED').length
  const gold = useGold()

  return (
    <main className="content">
      <div className="command-header">
        <div><span>Market Command Centre</span><h1>Markets ranked by current trading relevance.</h1></div>
        <div className="command-stats">
          <div><strong>{attention}</strong><span>Need attention</span></div>
          <div><strong>{approaching}</strong><span>Approaching</span></div>
          <div><strong>{waiting}</strong><span>Waiting</span></div>
          <div><StatusBadge tone={gold.monitoring ? 'positive' : 'danger'}>{gold.monitoring ? 'Monitoring on' : 'Monitoring off'}</StatusBadge><span>Master state</span></div>
        </div>
      </div>
      <div className="instrument-grid">
        {instruments.map((instrument) => <InstrumentSummaryCard instrument={instrument} onOpen={instrument.symbol === 'XAUUSD' ? onOpenGold : undefined} key={instrument.symbol} />)}
      </div>
    </main>
  )
}

export function GoldPage({ tab, onTab }: { tab: GoldTab; onTab: (tab: GoldTab) => void }) {
  const tabs: { id: GoldTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'orb', label: 'ORB' },
    { id: 'plan', label: 'Daily Plan' },
    { id: 'structure', label: 'Structure' },
    { id: 'manipulation', label: 'Manipulation' },
    { id: 'history', label: 'History' },
  ]
  return (
    <main className="content">
      <div className="page-intro"><div><span>Instrument workspace</span><h1>Gold / XAUUSD</h1><p>Decision support, strategy state and operational next actions.</p></div></div>
      <div className="tabs" role="tablist">{tabs.map((item) => <button role="tab" aria-selected={tab === item.id} className={tab === item.id ? 'active' : ''} onClick={() => onTab(item.id)} key={item.id}>{item.label}</button>)}</div>
      {tab === 'overview' && <GoldOverview onTab={onTab} />}
      {tab === 'orb' && <OrbWorkspace />}
      {tab === 'plan' && <DailyPlanWorkspace />}
      {tab === 'structure' && <StructureWorkspace />}
      {tab === 'manipulation' && <ManipulationWorkspace />}
      {tab === 'history' && <HistoryWorkspace />}
    </main>
  )
}

export function AlertsPage() {
  const gold = useGold()
  return (
    <main className="content">
      <div className="page-intro"><div><span>Monitoring control</span><h1>Alerts</h1><p>Configure local monitoring and review alert activity.</p></div></div>
      <div className="alert-settings">
        <Card title="Monitoring" eyebrow="Global state">
          <div className="setting-line"><div><strong>Price monitoring</strong><span>Watch all enabled plan levels</span></div><Toggle checked={gold.monitoring} onChange={gold.setMonitoring} label="Master price monitoring" /></div>
          <div className="setting-line"><div><strong>Enabled levels</strong><span>Individual level monitoring</span></div><b>{gold.plan.levels.filter((level) => level.enabled).length}</b></div>
        </Card>
        <Card title="Delivery" eyebrow="Alert channels">
          <div className="setting-line"><div><strong>Telegram</strong><span>Remote notifications</span></div><StatusBadge tone="danger">Not connected</StatusBadge></div>
          <div className="setting-line"><div><strong>Browser alerts</strong><span>Permission not requested</span></div><StatusBadge>Disabled</StatusBadge></div>
        </Card>
      </div>
      <AlertsCard alerts={gold.alerts} onAdd={gold.addTestAlert} onClear={gold.clearAlerts} large />
    </main>
  )
}

export function AdminPage({ settings, onSettings }: { settings: AppSettings; onSettings: (settings: AppSettings) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const exportSettings = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = 'deck-trading-dashboard-settings.json'; link.click()
    URL.revokeObjectURL(url)
  }
  const importSettings = async (file?: File) => {
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text()) as Partial<AppSettings>
      if ((parsed.theme === 'dark' || parsed.theme === 'slate') && typeof parsed.defaultApproachDistance === 'number') onSettings({ ...settings, ...parsed })
      else window.alert('This settings file is not valid.')
    } catch { window.alert('Unable to read this JSON settings file.') }
  }
  return (
    <main className="content">
      <div className="page-intro"><div><span>System configuration</span><h1>Admin</h1><p>Local preferences and future service integrations.</p></div></div>
      <div className="settings-grid">
        <Card title="Appearance" eyebrow="Interface"><div className="setting-line"><div><strong>Interface theme</strong><span>Choose terminal contrast</span></div><select aria-label="Interface theme" value={settings.theme} onChange={(e) => onSettings({ ...settings, theme: e.target.value as AppSettings['theme'] })}><option value="dark">Deep navy</option><option value="slate">Slate dark</option></select></div></Card>
        <Card title="Alert defaults" eyebrow="Monitoring"><label className="admin-field">Default approach distance<input type="number" min="0.1" step="0.1" value={settings.defaultApproachDistance} onChange={(e) => onSettings({ ...settings, defaultApproachDistance: Number(e.target.value) })} /></label></Card>
        <Card title="Instruments" eyebrow="Defaults"><div className="setting-line"><div><strong>Four instruments monitored</strong><span>XAUUSD workspace active; others use mock summaries</span></div><StatusBadge tone="positive">Active</StatusBadge></div></Card>
        <Card title="Sessions" eyebrow="Defaults"><div className="setting-line"><div><strong>Three market sessions</strong><span>Tokyo, London and New York</span></div><StatusBadge tone="positive">Active</StatusBadge></div></Card>
        {['cTrader API', 'Telegram'].map((name) => <Card title={name} eyebrow="Integration" key={name}><div className="setting-line"><div><strong>Not connected</strong><span>Credentials have not been configured</span></div><button className="secondary" disabled>Connect</button></div></Card>)}
        <Card title="Backup and restore" eyebrow="Local settings" className="backup-card"><p className="card-copy">Export your current preferences or restore them from a Deck Trading Dashboard JSON backup.</p><div className="button-row"><button className="primary" onClick={exportSettings}>Export JSON</button><button className="secondary" onClick={() => fileRef.current?.click()}>Import JSON</button><input ref={fileRef} className="hidden-input" type="file" accept=".json,application/json" onChange={(e) => void importSettings(e.target.files?.[0])} aria-label="Import settings JSON" /></div></Card>
      </div>
    </main>
  )
}
