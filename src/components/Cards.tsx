import type { Alert } from '../types'
import { StatusBadge } from './Chrome'

export function Card({ title, eyebrow, action, className = '', children }: {
  title: string
  eyebrow?: string
  action?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={`card ${className}`}>
      <div className="card-head"><div>{eyebrow && <span>{eyebrow}</span>}<h2>{title}</h2></div>{action}</div>
      {children}
    </section>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <label className="toggle" title={label}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} aria-label={label} />
      <span />
    </label>
  )
}

export function AlertsCard({ alerts, onAdd, onClear, large = false }: { alerts: Alert[]; onAdd: () => void; onClear: () => void; large?: boolean }) {
  return (
    <Card title="Recent Alerts" eyebrow="Activity log" className={large ? 'large-card' : ''} action={<span className="alert-count">{alerts.length} events</span>}>
      <div className="alerts-list">
        {alerts.length === 0
          ? <div className="empty">No alerts to display</div>
          : alerts.map((alert) => <div className="alert-row" key={alert.id}><time>{alert.time}</time><StatusBadge tone={alert.type === 'LEVEL' ? 'warning' : alert.type === 'TEST' ? 'positive' : 'neutral'}>{alert.type}</StatusBadge><span>{alert.message}</span><small>{alert.status}</small></div>)}
      </div>
      <div className="button-row"><button className="secondary" onClick={onClear}>Clear alerts</button><button className="primary" onClick={onAdd}>Add test alert</button></div>
    </Card>
  )
}
