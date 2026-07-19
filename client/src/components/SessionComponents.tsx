import { useSession } from '../hooks/useSession'
import { formatCandleDuration, formatSessionDuration } from '../services/sessionEngine'
import type { SessionState } from '../types/session'

const stateLabel = (state: SessionState) => state.replace('_', ' ')

export function SessionBar() {
  const session = useSession()
  const activeLabel = session.activeSessions.length
    ? session.activeSessions.map((item) => item.name).join(' + ')
    : 'No active session'

  return (
    <div className="session-bar" aria-label="Live market sessions">
      <div className="session-clocks">
        <span><small>LOCAL</small>{session.clocks.localTime}</span>
        <span><small>BROKER</small>{session.clocks.brokerTime}</span>
        <span className="utc-clock"><small>UTC</small>{session.clocks.utcTime}</span>
      </div>
      <div className="session-live">
        <strong>{activeLabel}</strong>
        <div className="session-pills">
          {Object.values(session.sessions).map((item) => (
            <span className={`session-pill session-${item.classification}`} title={`${item.name} ${stateLabel(item.state)}`} key={item.id}>
              {item.name.slice(0, 3).toUpperCase()}
            </span>
          ))}
        </div>
      </div>
      <div className="session-next">
        <small>NEXT</small>
        <span>{session.nextSession.session?.name ?? '—'} · {formatSessionDuration(session.nextSession.countdown)}</span>
      </div>
      <div className="candle-strip">
        {Object.values(session.candles).map((candle) => (
          <span className={candle.finalMinute ? 'final-minute' : ''} key={candle.timeframe}>
            <small>{candle.timeframe}</small>{formatCandleDuration(candle)}
          </span>
        ))}
      </div>
    </div>
  )
}

export function SessionStatusCard() {
  const session = useSession()
  const london = session.sessions.london
  const next = session.nextSession.session

  return (
    <section className="card session-status-card">
      <div className="card-head">
        <div><span>Live session engine</span><h2>Session Status</h2></div>
        <span className={`badge badge--${london.classification === 'open' ? 'positive' : london.classification === 'closing' ? 'danger' : london.classification === 'opening' ? 'warning' : 'neutral'}`}>
          {stateLabel(london.state)}
        </span>
      </div>
      <div className="session-status-main">
        <div><span>Current trading session</span><strong>{london.name}</strong></div>
        <div><span>Time remaining</span><strong>{formatSessionDuration(london.timeRemaining)}</strong></div>
      </div>
      <div className="session-progress">
        <div><span>Progress</span><strong>{london.progressPercentage.toFixed(0)}%</strong></div>
        <div className="session-progress-track"><i style={{ width: `${london.progressPercentage}%` }} /></div>
      </div>
      <div className="session-status-grid">
        <div><span>Next session</span><strong>{next ? `${next.name} in ${formatSessionDuration(session.nextSession.countdown)}` : '—'}</strong></div>
        <div><span>Overlap</span><strong>{session.overlap.active ? `${session.overlap.sessionNames.join(' / ')} · ${formatSessionDuration(session.overlap.timeRemaining)}` : 'Not active'}</strong></div>
      </div>
    </section>
  )
}
