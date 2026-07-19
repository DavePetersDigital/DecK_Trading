import { useSession } from '../hooks/useSession'
import { formatCandleDuration, formatSessionDuration } from '../services/sessionEngine'
import type { InstrumentWorkspaceState } from '../types'
import type { SessionId, SessionState, TradingSession } from '../types/session'
import { formatPrice } from '../utils/trading'

const stateLabel = (state: SessionState) => state.replace('_', ' ')

function sessionCountdownLabel(session: TradingSession) {
  return session.isActive
    ? `Closes in ${formatSessionDuration(session.countdownToClose)}`
    : `Opens in ${formatSessionDuration(session.countdownToOpen)}`
}

export function SessionBar({ instrument, context }: { instrument: InstrumentWorkspaceState; context: 'instrument' | 'overview' | 'dashboard' }) {
  const session = useSession()
  const isInstrument = context === 'instrument'

  return (
    <div className="session-bar" aria-label="Live market sessions">
      <div className="session-bar-top">
        <div className={`session-instrument ${isInstrument ? 'instrument-context' : 'global-context'}`}>
          {isInstrument && <div className="symbol-icon">{instrument.config.iconText ?? instrument.config.symbol.slice(0, 2)}</div>}
          <div>
            <span>{isInstrument ? `${instrument.config.symbol} · ${instrument.config.shortName.toUpperCase()}` : 'DECK TRADING DASHBOARD'}</span>
            <strong>{isInstrument ? formatPrice(instrument.price, instrument.config.priceDecimals) : context === 'overview' ? 'Market Overview' : 'Operations'}</strong>
          </div>
        </div>
        <div className="session-clocks">
          <span><small>LOCAL</small>{session.clocks.localTime}</span>
          <span><small>BROKER</small>{session.clocks.brokerTime}</span>
          <span><small>UTC</small>{session.clocks.utcTime}</span>
        </div>
        <div className="candle-strip">
          {Object.values(session.candles).map((candle) => (
            <span className={candle.finalMinute ? 'final-minute' : ''} key={candle.timeframe}>
              <small>{candle.timeframe}</small><strong>{formatCandleDuration(candle)}</strong>
            </span>
          ))}
        </div>
        <div className="live-status"><i className={`status-dot ${instrument.dataSourceStatus === 'Disconnected' ? 'red' : ''}`} />{instrument.dataSourceStatus === 'Mock' ? 'MOCK DATA' : instrument.dataSourceStatus.toUpperCase()}</div>
      </div>
      <div className="session-blocks">
        {Object.values(session.sessions).map((item) => (
          <div className={`session-block session-${item.classification}`} key={item.id}>
            <div className="session-block-heading">
              <div><span>{item.name}</span><small>{item.openTime}–{item.closeTime}</small></div>
              <strong>{stateLabel(item.state)}</strong>
            </div>
            <div className="session-block-countdown">{sessionCountdownLabel(item)}</div>
            {item.isActive && <div className="session-progress-track" aria-label={`${item.name} session ${item.progressPercentage.toFixed(0)}% complete`}><i style={{ width: `${item.progressPercentage}%` }} /></div>}
          </div>
        ))}
      </div>
    </div>
  )
}

export function SessionStatusCard({ sessionId = 'london' }: { sessionId?: SessionId }) {
  const session = useSession()
  const preferredSession = session.sessions[sessionId]
  const next = session.nextSession.session

  return (
    <section className="card session-status-card">
      <div className="card-head">
        <div><span>Live session engine</span><h2>Session Status</h2></div>
        <span className={`badge badge--${preferredSession.classification === 'open' ? 'positive' : preferredSession.classification === 'closing' ? 'danger' : preferredSession.classification === 'opening' ? 'warning' : 'neutral'}`}>
          {stateLabel(preferredSession.state)}
        </span>
      </div>
      <div className="session-status-main">
        <div><span>Current trading session</span><strong>{preferredSession.name}</strong></div>
        <div><span>Time remaining</span><strong>{formatSessionDuration(preferredSession.timeRemaining)}</strong></div>
      </div>
      <div className="session-progress">
        <div><span>Progress</span><strong>{preferredSession.progressPercentage.toFixed(0)}%</strong></div>
        <div className="session-progress-track"><i style={{ width: `${preferredSession.progressPercentage}%` }} /></div>
      </div>
      <div className="session-status-grid">
        <div><span>Next session</span><strong>{next ? `${next.name} in ${formatSessionDuration(session.nextSession.countdown)}` : '—'}</strong></div>
        <div><span>Overlap</span><strong>{session.overlap.active ? `${session.overlap.sessionNames.join(' / ')} · ${formatSessionDuration(session.overlap.timeRemaining)}` : 'Not active'}</strong></div>
      </div>
    </section>
  )
}
