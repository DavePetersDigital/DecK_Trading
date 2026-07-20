import { useCTraderStatus, type CTraderServiceStatus } from '../context/CTraderStatusContext'
import { useInstrumentStore } from '../context/InstrumentContext'
import type { InstrumentWorkspaceState, View } from '../types'
import { SessionBar } from './SessionComponents'

export function StatusBadge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: string }) {
  return <span className={`badge badge--${tone}`}>{children}</span>
}

const SERVICE_STATUS_LABELS: Record<CTraderServiceStatus, string> = {
  connected: 'Connected',
  not_connected: 'Not connected',
  not_configured: 'Not configured',
  connection_expired: 'Connection expired',
  error: 'Error',
}

function statusDotClass(status: CTraderServiceStatus) {
  if (status === 'connected') return 'status-dot'
  if (status === 'connection_expired') return 'status-dot amber'
  if (status === 'error') return 'status-dot red'
  return 'status-dot grey'
}

interface SidebarProps {
  view: View
  onNavigate: (view: View) => void
  onInstrument: (symbol: string) => void
}

export function Sidebar({ view, onNavigate, onInstrument }: SidebarProps) {
  const { instruments, selectedSymbol } = useInstrumentStore()
  const { status: cTraderStatus, canConnect, startConnect, notice } = useCTraderStatus()
  const links: { id: View; label: string; icon: string }[] = [
    { id: 'overview', label: 'Overview', icon: '▦' },
    { id: 'alerts', label: 'Alerts', icon: '◉' },
    { id: 'admin', label: 'Admin', icon: '⚙' },
  ]
  const workspaceInstruments = instruments
    .filter((instrument) => instrument.config.enabled && instrument.config.workspaceEnabled)
    .sort((left, right) => left.config.symbol.localeCompare(right.config.symbol))

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">DP</div>
        <div><strong>Deck Trading Dashboard</strong><span><i className="status-dot" />Monitoring active</span></div>
      </div>
      <nav aria-label="Primary navigation">
        <p className="nav-label">Workspace</p>
        {links.map((link) => (
          <button className={`nav-item ${view === link.id ? 'active' : ''}`} onClick={() => onNavigate(link.id)} key={link.id}>
            <span>{link.icon}</span>{link.label}
          </button>
        ))}
      </nav>
      <div className="instrument-list">
        <p className="nav-label">Instruments</p>
        {workspaceInstruments.map((instrument) => (
          <button className={`instrument ${view === 'instrument' && selectedSymbol === instrument.config.symbol ? 'active' : ''}`} onClick={() => onInstrument(instrument.config.symbol)} key={instrument.config.symbol}>
            <span className={instrument.monitoring ? 'status-dot' : 'status-dot red'} />
            {instrument.config.symbol}
            <small>{instrument.config.category}</small>
          </button>
        ))}
      </div>
      <div className="sidebar-status">
        <p className="nav-label">Services</p>
        {canConnect ? (
          <button
            type="button"
            className="service-row service-row--actionable"
            onClick={startConnect}
            aria-label="Connect cTrader"
          >
            <span><i className={statusDotClass(cTraderStatus)} />cTrader</span>
            <small>{SERVICE_STATUS_LABELS[cTraderStatus]}</small>
          </button>
        ) : (
          <div className="service-row">
            <span><i className={statusDotClass(cTraderStatus)} />cTrader</span>
            <small>{SERVICE_STATUS_LABELS[cTraderStatus]}</small>
          </div>
        )}
        <div className="service-row"><span><i className="status-dot red" />Telegram</span><small>Not connected</small></div>
        {notice && <p className="service-notice">{notice}</p>}
      </div>
    </aside>
  )
}

export function Header({ instrument, view }: { instrument: InstrumentWorkspaceState; view: View }) {
  return (
    <header className="top-header">
      <SessionBar instrument={instrument} context={view === 'instrument' ? 'instrument' : view === 'overview' ? 'overview' : 'dashboard'} />
    </header>
  )
}
