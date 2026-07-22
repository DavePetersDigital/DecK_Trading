import { useEffect, useState } from 'react'
import { Card } from './Cards'
import { StatusBadge } from './Chrome'
import { fetchOrbEngineState, type OrbEngineState, type OrbManipulation, type OrbMonitor } from '../services/orbApi'

const REFRESH_MS = 5000

const PHASE_LABELS: Record<OrbMonitor['phase'], string> = {
  waiting: 'Waiting for open',
  awaiting_candle: 'Forming M15',
  monitoring: 'Monitoring',
  no_data: 'No data',
  complete: 'Complete',
}

function formatPrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value.toLocaleString(undefined, { maximumFractionDigits: 5 })
}

function manipulationLabel(manipulation: OrbManipulation | null): { text: string; tone: 'positive' | 'danger' | 'neutral' } {
  if (!manipulation || manipulation.manipulation == null) return { text: 'Unknown', tone: 'neutral' }
  return manipulation.manipulation ? { text: 'Yes', tone: 'danger' } : { text: 'No', tone: 'positive' }
}

function alertCell(at: string | null): string {
  if (!at) return '—'
  const date = new Date(at)
  return Number.isNaN(date.getTime()) ? '—' : date.toISOString().slice(11, 19) + 'Z'
}

export function OrbEnginePanel() {
  const [state, setState] = useState<OrbEngineState | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const next = await fetchOrbEngineState()
        if (!active) return
        setState(next)
        setError(null)
      } catch (loadError) {
        if (!active) return
        setError(loadError instanceof Error ? loadError.message : 'Failed to load ORB engine state.')
      }
    }
    void load()
    const timer = window.setInterval(() => void load(), REFRESH_MS)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [])

  const monitors = state?.monitors ?? []
  const alerts = (state?.alerts ?? []).slice(0, 8)

  return (
    <Card title="ORB Engine" eyebrow="Opening Range monitor" className="orb-engine-panel">
      <div className="orb-engine-status">
        <StatusBadge tone={state?.running ? 'positive' : 'danger'}>
          {state?.running ? 'Engine running' : 'Engine stopped'}
        </StatusBadge>
        <StatusBadge tone={state?.connected ? 'positive' : 'neutral'}>
          {state?.connected ? 'cTrader live' : 'cTrader offline'}
        </StatusBadge>
        {error && <StatusBadge tone="danger">{error}</StatusBadge>}
      </div>

      {monitors.length === 0 ? (
        <p className="card-copy">No active Opening Profile monitors yet.</p>
      ) : (
        <div className="table-scroll">
          <table className="orb-monitor-table">
            <thead>
              <tr>
                <th>Instrument</th>
                <th>Opening Profile</th>
                <th>State</th>
                <th>Manipulation</th>
                <th>Class</th>
                <th>ORB High</th>
                <th>ORB Low</th>
                <th>Upside</th>
                <th>Downside</th>
              </tr>
            </thead>
            <tbody>
              {monitors.map((monitor) => {
                const manip = manipulationLabel(monitor.manipulation)
                return (
                  <tr key={monitor.key}>
                    <td>
                      <strong>{monitor.symbolName}</strong>
                      <span className="orb-subtle">{monitor.tradingDate}</span>
                    </td>
                    <td>{monitor.profileName}</td>
                    <td>{PHASE_LABELS[monitor.phase]}</td>
                    <td><StatusBadge tone={manip.tone}>{manip.text}</StatusBadge></td>
                    <td>{monitor.manipulation?.classification ?? '—'}</td>
                    <td>{formatPrice(monitor.openingRange?.high)}</td>
                    <td>{formatPrice(monitor.openingRange?.low)}</td>
                    <td>{alertCell(monitor.upsideAlertAt)}</td>
                    <td>{alertCell(monitor.downsideAlertAt)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="orb-recent-alerts">
        <h4>Recent alerts</h4>
        {alerts.length === 0 ? (
          <p className="card-copy">No breakout alerts yet.</p>
        ) : (
          <ul>
            {alerts.map((alert) => (
              <li key={alert.id}>
                <span className={`orb-alert-dir orb-alert-${alert.direction.toLowerCase()}`}>{alert.direction}</span>
                <strong>{alert.instrument}</strong> · {alert.openingProfile} · {formatPrice(alert.triggerPrice)}
                <span className="orb-subtle">{alert.message}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}
