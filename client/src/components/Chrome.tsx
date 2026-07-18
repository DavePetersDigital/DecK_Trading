import { useEffect, useState } from 'react'
import type { View } from '../types'
import { formatPrice } from '../utils/trading'

export function StatusBadge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: string }) {
  return <span className={`badge badge--${tone}`}>{children}</span>
}

interface SidebarProps {
  view: View
  onNavigate: (view: View) => void
}

export function Sidebar({ view, onNavigate }: SidebarProps) {
  const links: { id: View; label: string; icon: string }[] = [
    { id: 'overview', label: 'Overview', icon: '▦' },
    { id: 'gold', label: 'Gold', icon: '◆' },
    { id: 'alerts', label: 'Alerts', icon: '◉' },
    { id: 'admin', label: 'Admin', icon: '⚙' },
  ]

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
        <button className="instrument active" onClick={() => onNavigate('gold')}><span className="gold-dot" />XAUUSD</button>
        {['USDJPY', 'EURUSD', 'NAS100'].map((item) => (
          <button className="instrument" onClick={() => onNavigate('overview')} key={item}>{item}<small>Summary</small></button>
        ))}
      </div>
      <div className="sidebar-status">
        <div><span><i className="status-dot amber" />cTrader</span><small>Mock data</small></div>
        <div><span><i className="status-dot red" />Telegram</span><small>Not connected</small></div>
      </div>
    </aside>
  )
}

export function Header({ price, compact = false }: { price: number; compact?: boolean }) {
  const [clock, setClock] = useState(new Date())
  useEffect(() => {
    const id = window.setInterval(() => setClock(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <header className="top-header">
      <div className="symbol">
        <div className="symbol-icon">Au</div>
        <div><div><strong>XAUUSD</strong><span>Gold</span></div><small>Spot gold / U.S. Dollar</small></div>
      </div>
      {!compact && <div className="quote"><strong>{formatPrice(price)}</strong><span>+4.20 (+0.11%)</span></div>}
      <div className="header-right">
        <div className="session-badges">
          <StatusBadge>Tokyo · Closed</StatusBadge>
          <StatusBadge tone="positive">London · Open</StatusBadge>
          <StatusBadge>New York · Closed</StatusBadge>
        </div>
        <div className="live-status"><i className="status-dot" />LIVE MOCK</div>
        <time>{clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}<small>Local time</small></time>
      </div>
    </header>
  )
}
