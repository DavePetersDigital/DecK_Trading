import type {
  CandleCountdown, CandleTimeframe, SessionClassification,
  SessionConfiguration, SessionDefinition, SessionSnapshot, SessionState,
  TradingSession,
} from '../types/session'

const SECOND = 1
const MINUTE = 60
const DAY = 86_400

const timeframeSeconds: Record<CandleTimeframe, number> = {
  M1: 60,
  M5: 5 * MINUTE,
  M15: 15 * MINUTE,
  H1: 60 * MINUTE,
}

interface ZonedParts {
  year: number
  month: number
  day: number
  weekday: number
  hour: number
  minute: number
  second: number
}

const clockFormatter = (timeZone?: string) => new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
  ...(timeZone ? { timeZone } : {}),
})

function getZonedParts(now: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  const values = Object.fromEntries(formatter.formatToParts(now).map((part) => [part.type, part.value]))
  const year = Number(values.year)
  const month = Number(values.month)
  const day = Number(values.day)

  return {
    year,
    month,
    day,
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  }
}

const toSeconds = (hour: number, minute: number, second = 0) => hour * 3600 + minute * 60 + second
const formatSessionTime = ({ hour, minute }: { hour: number; minute: number }) =>
  `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`

function daysUntilNextWeekday(currentWeekday: number) {
  if (currentWeekday === 5) return 3
  if (currentWeekday === 6) return 2
  return 1
}

function secondsUntilWeekdayOpen(parts: ZonedParts, openSeconds: number) {
  const nowSeconds = toSeconds(parts.hour, parts.minute, parts.second)
  if (parts.weekday === 6) return 2 * DAY - nowSeconds + openSeconds
  if (parts.weekday === 0) return DAY - nowSeconds + openSeconds
  return daysUntilNextWeekday(parts.weekday) * DAY - nowSeconds + openSeconds
}

function classificationForState(state: SessionState): SessionClassification {
  if (state === 'OPEN') return 'open'
  if (state === 'OPENING_SOON') return 'opening'
  if (state === 'CLOSING_SOON') return 'closing'
  return 'closed'
}

export function calculateTradingSession(
  now: Date,
  definition: SessionDefinition,
  configuration: SessionConfiguration,
): TradingSession {
  const parts = getZonedParts(now, definition.timeZone)
  const nowSeconds = toSeconds(parts.hour, parts.minute, parts.second)
  const openSeconds = toSeconds(definition.open.hour, definition.open.minute)
  const closeSeconds = toSeconds(definition.close.hour, definition.close.minute)
  const weekend = parts.weekday === 0 || parts.weekday === 6
  let active = false
  let secondsToOpen = 0
  let secondsToClose = 0
  let elapsed = 0
  let sessionLength = 0

  if (weekend) {
    secondsToOpen = secondsUntilWeekdayOpen(parts, openSeconds)
  } else if (openSeconds < closeSeconds) {
    active = nowSeconds >= openSeconds && nowSeconds < closeSeconds
    if (active) {
      sessionLength = closeSeconds - openSeconds
      elapsed = nowSeconds - openSeconds
      secondsToClose = closeSeconds - nowSeconds
    } else if (nowSeconds < openSeconds) {
      secondsToOpen = openSeconds - nowSeconds
    } else {
      secondsToOpen = secondsUntilWeekdayOpen(parts, openSeconds)
    }
  } else {
    active = nowSeconds >= openSeconds || nowSeconds < closeSeconds
    if (active) {
      sessionLength = DAY - openSeconds + closeSeconds
      if (nowSeconds >= openSeconds) {
        elapsed = nowSeconds - openSeconds
        secondsToClose = DAY - nowSeconds + closeSeconds
      } else {
        elapsed = DAY - openSeconds + nowSeconds
        secondsToClose = closeSeconds - nowSeconds
      }
    } else {
      secondsToOpen = openSeconds - nowSeconds
    }
  }

  let state: SessionState = 'CLOSED'
  if (active) {
    state = configuration.closingSoonMinutes > 0 &&
      secondsToClose <= configuration.closingSoonMinutes * MINUTE
      ? 'CLOSING_SOON'
      : 'OPEN'
  } else if (configuration.openingSoonMinutes > 0 &&
    secondsToOpen <= configuration.openingSoonMinutes * MINUTE) {
    state = 'OPENING_SOON'
  }

  return {
    id: definition.id,
    name: definition.name,
    state,
    openTime: formatSessionTime(definition.open),
    closeTime: formatSessionTime(definition.close),
    localTime: clockFormatter(definition.timeZone).format(now),
    countdownToOpen: active ? 0 : secondsToOpen,
    countdownToClose: active ? secondsToClose : 0,
    progressPercentage: sessionLength > 0 ? Math.min(100, Math.max(0, (elapsed / sessionLength) * 100)) : 0,
    isActive: active,
    timeRemaining: active ? secondsToClose : secondsToOpen,
    classification: classificationForState(state),
  }
}

export function calculateCandleCountdown(
  now: Date,
  timeframe: CandleTimeframe,
  brokerUtcOffsetMinutes: number,
  alertSeconds = 60,
): CandleCountdown {
  const duration = timeframeSeconds[timeframe]
  const brokerEpochSeconds = Math.floor(now.getTime() / 1000) + brokerUtcOffsetMinutes * MINUTE
  const elapsed = ((brokerEpochSeconds % duration) + duration) % duration
  const secondsRemaining = elapsed === 0 ? duration : duration - elapsed

  return {
    timeframe,
    durationSeconds: duration,
    secondsRemaining,
    minutes: Math.floor(secondsRemaining / MINUTE),
    seconds: secondsRemaining % MINUTE,
    percentageComplete: (elapsed / duration) * 100,
    finalMinute: secondsRemaining <= Math.max(alertSeconds, 0),
  }
}

export function buildSessionSnapshot(now: Date, configuration: SessionConfiguration): SessionSnapshot {
  const sessionList = Object.values(configuration.sessions).map((definition) =>
    calculateTradingSession(now, definition, configuration))
  const sessions = Object.fromEntries(sessionList.map((session) => [session.id, session])) as SessionSnapshot['sessions']
  const activeSessions = sessionList.filter((session) => session.isActive)
  const overlapSessions = activeSessions.length >= 2 ? activeSessions : []
  const nextSession = sessionList
    .filter((session) => !session.isActive)
    .sort((left, right) => left.countdownToOpen - right.countdownToOpen)[0] ?? null
  const brokerDate = new Date(now.getTime() + configuration.brokerUtcOffsetMinutes * MINUTE * 1000)

  return {
    now,
    clocks: {
      localTime: clockFormatter().format(now),
      brokerTime: clockFormatter('UTC').format(brokerDate),
      utcTime: clockFormatter('UTC').format(now),
    },
    sessions,
    activeSessions,
    overlap: {
      active: overlapSessions.length >= 2,
      sessions: overlapSessions.map((session) => session.id),
      sessionNames: overlapSessions.map((session) => session.name),
      timeRemaining: overlapSessions.length
        ? Math.min(...overlapSessions.map((session) => session.countdownToClose))
        : 0,
    },
    candles: {
      M1: calculateCandleCountdown(now, 'M1', configuration.brokerUtcOffsetMinutes, configuration.candleAlertSeconds),
      M5: calculateCandleCountdown(now, 'M5', configuration.brokerUtcOffsetMinutes, configuration.candleAlertSeconds),
      M15: calculateCandleCountdown(now, 'M15', configuration.brokerUtcOffsetMinutes, configuration.candleAlertSeconds),
      H1: calculateCandleCountdown(now, 'H1', configuration.brokerUtcOffsetMinutes, configuration.candleAlertSeconds),
    },
    nextSession: {
      session: nextSession,
      countdown: nextSession?.countdownToOpen ?? 0,
    },
    configuration,
  }
}

export function formatSessionDuration(totalSeconds: number) {
  const value = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(value / 3600)
  const minutes = Math.floor((value % 3600) / 60)
  const seconds = value % 60
  return `${hours > 0 ? `${hours}h ` : ''}${String(minutes).padStart(hours > 0 ? 2 : 1, '0')}m ${String(seconds).padStart(2, '0')}s`
}

export function formatCandleDuration(countdown: CandleCountdown) {
  return `${String(countdown.minutes).padStart(2, '0')}:${String(countdown.seconds).padStart(2, '0')}`
}

export const SESSION_ENGINE_TICK_MS = 1000 * SECOND
