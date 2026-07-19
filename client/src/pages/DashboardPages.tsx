import { useEffect, useRef, useState } from 'react'
import { AlertsCard, Card, Toggle } from '../components/Cards'
import { StatusBadge } from '../components/Chrome'
import {
  InstrumentDailyPlanWorkspace, InstrumentHistoryWorkspace, InstrumentManipulationWorkspace,
  InstrumentOperationalSubtitle, InstrumentOrbWorkspace, InstrumentOverview, InstrumentStructureWorkspace,
} from '../components/TradingAssistantPanels'
import { MarketCommandCentre } from '../components/MarketCommandCentre'
import { InstrumentManagement } from '../components/InstrumentManagement'
import { useInstrumentWorkspace } from '../context/InstrumentContext'
import type { AppSettings, InstrumentTab } from '../types'

export function OverviewPage({ onOpenInstrument }: { onOpenInstrument: (symbol: string) => void }) {
  return <MarketCommandCentre onOpenInstrument={onOpenInstrument} />
}

export function InstrumentPage({ tab, onTab }: { tab: InstrumentTab; onTab: (tab: InstrumentTab) => void }) {
  const instrument = useInstrumentWorkspace()
  const allTabs: { id: InstrumentTab; label: string; enabled: boolean }[] = [
    { id: 'overview', label: 'Overview', enabled: true },
    { id: 'orb', label: 'ORB', enabled: instrument.config.strategies.orb },
    { id: 'plan', label: 'Daily Plan', enabled: instrument.config.strategies.dailyPlan },
    { id: 'structure', label: 'Structure', enabled: instrument.config.strategies.structure },
    { id: 'manipulation', label: 'Manipulation', enabled: instrument.config.strategies.manipulation },
    { id: 'history', label: 'History', enabled: true },
  ]
  const tabs = allTabs.filter((item) => item.enabled)
  const activeTab = tabs.some((item) => item.id === tab) ? tab : 'overview'
  return (
    <main className="content">
      <div className="page-intro gold-page-intro"><div><span>Instrument workspace</span><h1>{instrument.config.shortName} / {instrument.config.symbol}</h1><InstrumentOperationalSubtitle /></div></div>
      <div className="tabs" role="tablist">{tabs.map((item) => <button role="tab" aria-selected={activeTab === item.id} className={activeTab === item.id ? 'active' : ''} onClick={() => onTab(item.id)} key={item.id}>{item.label}</button>)}</div>
      {activeTab === 'overview' && <InstrumentOverview onTab={onTab} />}
      {activeTab === 'orb' && <InstrumentOrbWorkspace />}
      {activeTab === 'plan' && <InstrumentDailyPlanWorkspace />}
      {activeTab === 'structure' && <InstrumentStructureWorkspace />}
      {activeTab === 'manipulation' && <InstrumentManipulationWorkspace />}
      {activeTab === 'history' && <InstrumentHistoryWorkspace />}
    </main>
  )
}

export function AlertsPage() {
  const gold = useInstrumentWorkspace()
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
  const [cTraderStatus, setCTraderStatus] = useState<'connected' | 'not-connected'>('not-connected')
  const cTraderConnected = cTraderStatus === 'connected'

  useEffect(() => {
    let active = true
    const loadIntegrationStatus = async () => {
      try {
        const response = await fetch('/api/status')
        if (!response.ok) return
        const status = await response.json() as { cTrader?: unknown }
        if (active && (status.cTrader === 'connected' || status.cTrader === 'not-connected')) {
          setCTraderStatus(status.cTrader)
        }
      } catch {
        // Keep the integration disconnected when status cannot be loaded.
      }
    }
    void loadIntegrationStatus()
    return () => { active = false }
  }, [])

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
      <InstrumentManagement />
      <div className="settings-grid">
        <Card title="Appearance" eyebrow="Interface"><div className="setting-line"><div><strong>Interface theme</strong><span>Choose terminal contrast</span></div><select aria-label="Interface theme" value={settings.theme} onChange={(e) => onSettings({ ...settings, theme: e.target.value as AppSettings['theme'] })}><option value="dark">Deep navy</option><option value="slate">Slate dark</option></select></div></Card>
        <Card title="Alert defaults" eyebrow="Monitoring"><label className="admin-field">Default approach distance<input type="number" min="0.1" step="0.1" value={settings.defaultApproachDistance} onChange={(e) => onSettings({ ...settings, defaultApproachDistance: Number(e.target.value) })} /></label></Card>
        <Card title="Sessions" eyebrow="Defaults"><div className="setting-line"><div><strong>Three market sessions</strong><span>Tokyo, London and New York</span></div><StatusBadge tone="positive">Active</StatusBadge></div></Card>
        <Card title="cTrader API" eyebrow="Integration"><div className="setting-line"><div><strong>{cTraderConnected ? 'Connected' : 'Not connected'}</strong><span>{cTraderConnected ? 'Successfully authenticated with cTrader' : 'Connect your cTrader account'}</span></div><button className="secondary" disabled={cTraderConnected} onClick={() => window.location.assign('/api/ctrader/login')}>Connect</button></div></Card>
        <Card title="Telegram" eyebrow="Integration"><div className="setting-line"><div><strong>Not connected</strong><span>Credentials have not been configured</span></div><button className="secondary" disabled>Connect</button></div></Card>
        <Card title="Backup and restore" eyebrow="Local settings" className="backup-card"><p className="card-copy">Export your current preferences or restore them from a Deck Trading Dashboard JSON backup.</p><div className="button-row"><button className="primary" onClick={exportSettings}>Export JSON</button><button className="secondary" onClick={() => fileRef.current?.click()}>Import JSON</button><input ref={fileRef} className="hidden-input" type="file" accept=".json,application/json" onChange={(e) => void importSettings(e.target.files?.[0])} aria-label="Import settings JSON" /></div></Card>
      </div>
    </main>
  )
}
