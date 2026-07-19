import { useInstrumentStore } from '../context/InstrumentContext'
import type { InstrumentWorkspaceState, View } from '../types'
import { SessionBar } from './SessionComponents'

export function StatusBadge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: string }) {
  return <span className={`badge badge--${tone}`}>{children}</span>
}

interface SidebarProps {
  view: View
  onNavigate: (view: View) => void
  onInstrument: (symbol: string) => void
}

export function Sidebar({ view, onNavigate, onInstrument }: SidebarProps) {
  const { instruments, selectedSymbol } = useInstrumentStore()
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
        <div><span><i className="status-dot amber" />cTrader</span><small>Mock data</small></div>
        <div><span><i className="status-dot red" />Telegram</span><small>Not connected</small></div>
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
