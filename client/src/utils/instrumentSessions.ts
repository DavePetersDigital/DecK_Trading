import type { InstrumentConfiguration } from '../types'
import type { SessionSnapshot, TradingSession } from '../types/session'

export function selectMonitoredSession(
  config: InstrumentConfiguration,
  sessions: SessionSnapshot['sessions'],
): TradingSession {
  const configured = config.monitoredSessions.map((sessionId) => sessions[sessionId])
  return configured.find((session) => session.isActive)
    ?? configured.find((session) => session.state === 'OPENING_SOON')
    ?? [...configured].sort((left, right) => left.countdownToOpen - right.countdownToOpen)[0]
    ?? sessions.london
}

export function hasActiveMonitoredSession(
  config: InstrumentConfiguration,
  sessions: SessionSnapshot['sessions'],
) {
  return config.monitoredSessions.some((sessionId) => sessions[sessionId].isActive)
}
