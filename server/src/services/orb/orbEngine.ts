// Backend ORB engine.
//
// Runs entirely on the server (browser tabs are irrelevant). On startup it
// loads monitored instruments + Opening Profiles, restores persisted state,
// and begins a scan loop that, per (instrument, Opening Profile, trading date):
//   1. waits for the opening time,
//   2. captures the first completed M15 candle (Opening Range),
//   3. classifies manipulation via the profile's algorithm,
//   4. arms live breakout monitoring, and
//   5. emits one alert per direction telling the trader to watch the M5 chart.

import { randomUUID } from 'node:crypto'
import { logger } from '../../utils/logger.js'
import { getConfiguredCTraderHistory } from '../ctraderAccountService.js'
import { CTraderOAuthError, getCTraderAccessToken } from '../ctraderService.js'
import {
  ensureCTraderSpotStream,
  getLatestLiveSpotSnapshot,
  getSubscribedSpotSymbols,
  onSpotTick,
  subscribeSpotSymbols,
  type LiveTick,
} from '../ctraderSpotStreamService.js'
import { getEnabledMonitoredInstruments, type MonitorableInstrument } from '../monitoredInstrumentMonitorService.js'
import { listOpeningProfiles } from '../openingProfile/openingProfileStore.js'
import {
  ORB_DURATION_MS,
  computeClosingInstantUtc,
  computeOpeningInstantUtc,
  computeTradingWindowEndUtc,
  isTraderAlertAllowed,
  previousTradingDates,
  tradingDateForInstant,
  type OpeningProfile,
} from '../openingProfile/openingProfileRules.js'
import {
  buildOpeningRange,
  collectHistoricalRanges,
  findOpeningCandle,
  isCandleComplete,
} from '../openingRange/openingRangeRules.js'
import { evaluateManipulation } from '../manipulation/manipulationEngine.js'
import { NORMAL_ATR_PERIOD } from '../manipulation/normalManipulation.js'
import { calculateWilderAtr, selectCompletedDailyCandles } from '../atr/wilderAtr.js'
import { getTrendForSymbol } from '../trend/trendEngine.js'
import { applyTick, createBreakoutState, type BreakoutState } from './orbBreakout.js'
import { CANDLE_DURATION_MS } from './orbCandleBreakout.js'
import {
  marketEventDirectionFor,
  marketEventDedupeKey,
  marketEventLabel,
  type MarketEvent,
  type MarketEventManipulation,
  type MarketEventTimeframe,
} from './marketEvent.js'
import {
  advanceOrbZoneFromCandles,
  emptyOrbZoneSnapshot,
  normalizeZoneSnapshot,
  type OrbZoneTransition,
} from './orbZoneState.js'
import {
  marketEventToOrbAlert,
  readOrbState,
  writeOrbState,
  type OrbAlert,
  type OrbMonitorPhase,
  type OrbMonitorRecord,
} from './orbStateStore.js'

const SCAN_INTERVAL_MS = 30_000
// ~42 days of M15 candles: enough trading days to gather 20 ranking samples
// even with weekends and holidays, while staying under the 5000 API cap.
const HISTORY_M15_COUNT = 4000
const HISTORY_BREAKOUT_COUNT = 120
/** Enough completed D1 bars for Wilder ATR(14) (+ prior close) with spare. */
const HISTORY_D1_ATR_COUNT = 40
const HISTORICAL_SAMPLE_TARGET = 20
const HISTORICAL_SCAN_DAYS = 60

const monitors = new Map<string, OrbMonitorRecord>()
// Live tick state (prev bid/ask) is intentionally in-memory only; alerted
// flags are restored from persisted alert timestamps so restarts never
// double-alert. A missing prev simply means the first post-restart tick can't
// register a crossing, which is the correct behaviour.
const breakoutRuntime = new Map<string, BreakoutState>()
/** Canonical activity feed — candle-close ORB zone transitions. */
let marketEvents: MarketEvent[] = []
const eventDedupeKeys = new Set<string>()
const capturing = new Set<string>()
const refreshingBreakouts = new Set<string>()

let scanTimer: ReturnType<typeof setInterval> | null = null
let unsubscribeTick: (() => void) | null = null
let started = false
let persistChain: Promise<void> = Promise.resolve()
/** Latest profile config keyed by profile id — used for alert gating on ticks. */
const profilesById = new Map<string, OpeningProfile>()

function monitorKey(symbolId: string, profileId: string, tradingDate: string): string {
  return `${symbolId}|${profileId}|${tradingDate}`
}

function schedulePersist() {
  persistChain = persistChain
    .then(() => writeOrbState([...monitors.values()], marketEvents))
    .catch((error) => logger.error('Failed to persist ORB engine state.', error))
}

function rememberEventKeys(events: MarketEvent[]) {
  for (const event of events) {
    if (!event.candleCloseTime) continue
    eventDedupeKeys.add(
      marketEventDedupeKey({
        instrumentId: event.instrumentId,
        openingProfileId: event.openingProfileId,
        tradingDate: event.tradingDate,
        timeframe: event.timeframe,
        eventType: event.eventType,
        candleCloseTime: event.candleCloseTime,
      }),
    )
  }
}

function manipulationCategoryFor(record: OrbMonitorRecord): MarketEventManipulation | null {
  const manipulation = record.manipulation?.manipulation
  if (manipulation === false) return 'no'
  if (manipulation !== true) return null
  const classification = record.manipulation?.classification
  if (classification === 'EXTREME') return 'extreme'
  if (classification === 'LARGE') return 'large'
  return 'normal'
}

function setPhase(record: OrbMonitorRecord, phase: OrbMonitorPhase) {
  if (record.phase !== phase) {
    record.phase = phase
    record.updatedAt = new Date().toISOString()
  }
}

function syncProfileFields(record: OrbMonitorRecord, profile: OpeningProfile, tradingDate: string) {
  record.alertMode = profile.alertMode
  record.profileName = profile.displayName
  record.tradingWindowMinutes = profile.tradingWindowMinutes
  record.allowTradesAfterWindow = profile.allowTradesAfterWindow
  record.closingInstantUtc = computeClosingInstantUtc(profile, tradingDate).toISOString()
  record.tradingWindowEndUtc = computeTradingWindowEndUtc(profile, tradingDate).toISOString()
}

function createWaitingRecord(
  instrument: MonitorableInstrument,
  profile: OpeningProfile,
  tradingDate: string,
  openingInstant: Date,
  now: Date,
): OrbMonitorRecord {
  return {
    key: monitorKey(instrument.symbolId, profile.id, tradingDate),
    symbolId: instrument.symbolId,
    symbolName: instrument.symbolName,
    displayName: instrument.displayName,
    profileId: profile.id,
    profileName: profile.displayName,
    // Manipulation algorithm is chosen per instrument (gold_specific for
    // XAUUSD, normal placeholder otherwise), independent of the strategy.
    manipulationMode: instrument.manipulationMode,
    alertMode: profile.alertMode,
    tradingDate,
    openingInstantUtc: openingInstant.toISOString(),
    openingCandleCloseUtc: new Date(openingInstant.getTime() + ORB_DURATION_MS).toISOString(),
    closingInstantUtc: computeClosingInstantUtc(profile, tradingDate).toISOString(),
    tradingWindowMinutes: profile.tradingWindowMinutes,
    allowTradesAfterWindow: profile.allowTradesAfterWindow,
    tradingWindowEndUtc: computeTradingWindowEndUtc(profile, tradingDate).toISOString(),
    phase: 'waiting',
    openingRange: null,
    manipulation: null,
    trend: null,
    m5Breakout: null,
    m15Breakout: null,
    upsideAlertAt: null,
    downsideAlertAt: null,
    updatedAt: now.toISOString(),
  }
}

async function refreshTrend(record: OrbMonitorRecord, profile: OpeningProfile): Promise<void> {
  const snapshot = await getTrendForSymbol(record.symbolId, {
    emaPeriod: profile.trendEmaPeriod,
    timeframe: profile.trendTimeframe,
  })
  if (snapshot) {
    record.trend = snapshot
    record.updatedAt = new Date().toISOString()
    monitors.set(record.key, record)
    schedulePersist()
  }
}

export async function startOrbEngine(): Promise<void> {
  if (started) return
  started = true

  const state = await readOrbState()
  for (const record of state.monitors) {
    // Backfill fields added after this record was persisted.
    record.alertMode ??= 'all_breakouts'
    record.trend ??= null
    record.m5Breakout ??= null
    record.m15Breakout ??= null
    record.tradingWindowMinutes ??= 120
    record.allowTradesAfterWindow ??= true
    record.closingInstantUtc ??= record.openingCandleCloseUtc
    record.tradingWindowEndUtc ??= new Date(
      Date.parse(record.openingInstantUtc) + record.tradingWindowMinutes * 60_000,
    ).toISOString()
    monitors.set(record.key, record)
    breakoutRuntime.set(
      record.key,
      createBreakoutState({
        upsideAlerted: record.upsideAlertAt != null,
        downsideAlerted: record.downsideAlertAt != null,
      }),
    )
  }
  marketEvents = state.events ?? []
  eventDedupeKeys.clear()
  rememberEventKeys(marketEvents)

  unsubscribeTick = onSpotTick(handleTick)
  await scan()
  scanTimer = setInterval(() => {
    void scan()
  }, SCAN_INTERVAL_MS)
  logger.info('ORB engine started.')
}

export function stopOrbEngine(): void {
  if (scanTimer) clearInterval(scanTimer)
  scanTimer = null
  if (unsubscribeTick) unsubscribeTick()
  unsubscribeTick = null
  started = false
}

async function scan(): Promise<void> {
  let profiles: OpeningProfile[]
  let instruments: MonitorableInstrument[]
  try {
    ;[profiles, instruments] = await Promise.all([listOpeningProfiles(), getEnabledMonitoredInstruments()])
  } catch (error) {
    logger.error('ORB scan: failed to load configuration.', error)
    return
  }

  const profileById = new Map(profiles.map((profile) => [profile.id, profile]))
  profilesById.clear()
  for (const [id, profile] of profileById) profilesById.set(id, profile)
  const now = new Date()
  const activeKeys = new Set<string>()
  const symbolsToWatch = new Set<string>()

  for (const instrument of instruments) {
    for (const profileId of instrument.openingProfileIds) {
      const profile = profileById.get(profileId)
      if (!profile) continue

      const tradingDate = tradingDateForInstant(profile.timezone, now)
      const openingInstant = computeOpeningInstantUtc(profile, tradingDate)
      const candleClose = new Date(openingInstant.getTime() + ORB_DURATION_MS)
      const key = monitorKey(instrument.symbolId, profile.id, tradingDate)
      activeKeys.add(key)

      let record = monitors.get(key)
      if (!record) {
        record = createWaitingRecord(instrument, profile, tradingDate, openingInstant, now)
        monitors.set(key, record)
        breakoutRuntime.set(key, createBreakoutState())
      }
      // Keep strategy / trading-window config in sync with the (possibly edited) profile.
      record.manipulationMode = instrument.manipulationMode
      syncProfileFields(record, profile, tradingDate)
      void refreshTrend(record, profile)

      if (now < openingInstant) {
        setPhase(record, 'waiting')
        continue
      }
      if (now < candleClose) {
        setPhase(record, 'awaiting_candle')
        continue
      }

      if (record.openingRange) {
        symbolsToWatch.add(instrument.symbolId)
        void refreshCandleBreakouts(record)
      } else {
        void captureOpeningRange(key, instrument, profile, tradingDate, openingInstant)
      }
    }
  }

  // Drop monitors that are no longer assigned in the current admin config
  // (or belong to a previous trading date). Keeping them caused the scanner
  // to show disabled Opening Profiles (e.g. EURUSD still showing New York FX
  // after the admin assignment was reduced to London only).
  for (const key of [...monitors.keys()]) {
    if (!activeKeys.has(key)) {
      monitors.delete(key)
      breakoutRuntime.delete(key)
    }
  }

  if (getCTraderAccessToken() && symbolsToWatch.size > 0) {
    ensureCTraderSpotStream()
    subscribeSpotSymbols([...symbolsToWatch])
  }

  schedulePersist()
}

async function captureOpeningRange(
  key: string,
  instrument: MonitorableInstrument,
  profile: OpeningProfile,
  tradingDate: string,
  openingInstant: Date,
): Promise<void> {
  if (capturing.has(key)) return
  const record = monitors.get(key)
  if (!record || record.openingRange) return
  if (!getCTraderAccessToken()) return // wait until cTrader is authenticated

  capturing.add(key)
  try {
    const candles = await getConfiguredCTraderHistory({
      symbolId: instrument.symbolId,
      timeframe: 'M15',
      count: HISTORY_M15_COUNT,
    })

    const openingCandle = findOpeningCandle(candles, openingInstant)
    const now = new Date()
    if (!openingCandle || !isCandleComplete(openingCandle, now)) {
      // History has not delivered the completed candle yet; retry next scan.
      return
    }

    const openingRange = buildOpeningRange(openingCandle)
    if (!openingRange) {
      setPhase(record, 'no_data')
      schedulePersist()
      return
    }

    const openingInstants = previousTradingDates(tradingDate, HISTORICAL_SCAN_DAYS).map((date) =>
      computeOpeningInstantUtc(profile, date),
    )
    const historicalRanges = collectHistoricalRanges(candles, openingInstants, HISTORICAL_SAMPLE_TARGET)

    let manipulation
    if (instrument.manipulationMode === 'normal') {
      const dailyCandles = await getConfiguredCTraderHistory({
        symbolId: instrument.symbolId,
        timeframe: 'D1',
        count: HISTORY_D1_ATR_COUNT,
      })
      const completedDaily = selectCompletedDailyCandles(dailyCandles, now)
      const atr = calculateWilderAtr(completedDaily, NORMAL_ATR_PERIOD)
      manipulation = evaluateManipulation('normal', {
        currentRange: openingRange.range,
        historicalRanges: [],
        dailyAtr: atr?.value ?? null,
        atrSampleCount: atr?.trueRangeCount ?? Math.max(0, completedDaily.length - 1),
      })
    } else {
      manipulation = evaluateManipulation(instrument.manipulationMode, {
        currentRange: openingRange.range,
        historicalRanges,
      })
    }

    record.openingRange = openingRange
    record.manipulation = manipulation
    record.m5Breakout ??= emptyOrbZoneSnapshot()
    record.m15Breakout ??= emptyOrbZoneSnapshot()
    setPhase(record, 'monitoring')
    record.updatedAt = new Date().toISOString()
    monitors.set(key, record)
    if (!breakoutRuntime.has(key)) breakoutRuntime.set(key, createBreakoutState())

    ensureCTraderSpotStream()
    subscribeSpotSymbols([instrument.symbolId])
    void refreshCandleBreakouts(record)

    logger.info(
      `ORB opening range captured: ${instrument.symbolName} / ${profile.displayName} / ${tradingDate} ` +
        `range=${openingRange.range} dir=${openingRange.direction} manip=${manipulation.classification}`,
    )
    schedulePersist()
  } catch (error) {
    if (error instanceof CTraderOAuthError) return // not authenticated yet
    logger.error(`ORB capture failed for ${key}.`, error)
  } finally {
    capturing.delete(key)
  }
}

async function refreshCandleBreakouts(record: OrbMonitorRecord): Promise<void> {
  if (!record.openingRange) return
  if (refreshingBreakouts.has(record.key)) return
  if (!getCTraderAccessToken()) return

  refreshingBreakouts.add(record.key)
  try {
    const afterMs = Date.parse(record.openingCandleCloseUtc)
    const now = new Date()
    const [m5Candles, m15Candles] = await Promise.all([
      getConfiguredCTraderHistory({ symbolId: record.symbolId, timeframe: 'M5', count: HISTORY_BREAKOUT_COUNT }),
      getConfiguredCTraderHistory({ symbolId: record.symbolId, timeframe: 'M15', count: HISTORY_BREAKOUT_COUNT }),
    ])

    let dirty = false
    const previousM5 = normalizeZoneSnapshot(record.m5Breakout)
    const previousM15 = normalizeZoneSnapshot(record.m15Breakout)

    const m5 = advanceOrbZoneFromCandles(
      previousM5,
      m5Candles,
      record.openingRange.high,
      record.openingRange.low,
      afterMs,
      CANDLE_DURATION_MS.M5,
      'M5',
      now,
    )
    const m15 = advanceOrbZoneFromCandles(
      previousM15,
      m15Candles,
      record.openingRange.high,
      record.openingRange.low,
      afterMs,
      CANDLE_DURATION_MS.M15,
      'M15',
      now,
    )

    if (JSON.stringify(m5.snapshot) !== JSON.stringify(previousM5)) {
      record.m5Breakout = m5.snapshot
      dirty = true
    } else {
      record.m5Breakout ??= emptyOrbZoneSnapshot()
    }
    if (JSON.stringify(m15.snapshot) !== JSON.stringify(previousM15)) {
      record.m15Breakout = m15.snapshot
      dirty = true
    } else {
      record.m15Breakout ??= emptyOrbZoneSnapshot()
    }

    const emitted = [
      ...emitTransitions(record, m5.transitions, now),
      ...emitTransitions(record, m15.transitions, now),
    ]
    if (emitted.length > 0) dirty = true

    if (dirty) {
      record.updatedAt = now.toISOString()
      monitors.set(record.key, record)
      schedulePersist()
    }
  } catch (error) {
    if (!(error instanceof CTraderOAuthError)) {
      logger.error(`ORB candle-breakout refresh failed for ${record.key}.`, error)
    }
  } finally {
    refreshingBreakouts.delete(record.key)
  }
}

function emitTransitions(
  record: OrbMonitorRecord,
  transitions: OrbZoneTransition[],
  now: Date,
): MarketEvent[] {
  const created: MarketEvent[] = []
  for (const transition of transitions) {
    const event = buildMarketEventFromTransition(record, transition, now)
    if (!tryPushMarketEvent(event)) continue
    created.push(event)
    logger.info(
      `MARKET EVENT: ${event.symbol} / ${event.openingProfileName} / ${event.timeframe} / ${marketEventLabel(event.eventType)}` +
        (event.notificationEligible ? '' : ' (history only)'),
    )
  }
  return created
}

function tryPushMarketEvent(event: MarketEvent): boolean {
  if (!event.candleCloseTime) return false
  const key = marketEventDedupeKey({
    instrumentId: event.instrumentId,
    openingProfileId: event.openingProfileId,
    tradingDate: event.tradingDate,
    timeframe: event.timeframe,
    eventType: event.eventType,
    candleCloseTime: event.candleCloseTime,
  })
  if (eventDedupeKeys.has(key)) return false
  eventDedupeKeys.add(key)
  marketEvents.push(event)
  return true
}

function buildMarketEventFromTransition(
  record: OrbMonitorRecord,
  transition: OrbZoneTransition,
  now: Date,
): MarketEvent {
  const profile = profilesById.get(record.profileId)
  const windowActive = profile
    ? now.getTime() <= computeTradingWindowEndUtc(profile, record.tradingDate).getTime()
    : now.getTime() <= Date.parse(record.tradingWindowEndUtc)
  const extendedAllowed = profile?.allowTradesAfterWindow ?? record.allowTradesAfterWindow
  const strategyAllows =
    record.alertMode === 'all_breakouts' || record.manipulation?.manipulation === true
  const windowAllows = profile
    ? isTraderAlertAllowed(profile, record.tradingDate, now)
    : extendedAllowed || windowActive
  const qualified = record.manipulation?.manipulation === true
  const notificationEligible = strategyAllows && windowAllows
  const timeframe: MarketEventTimeframe = transition.timeframe
  // M15 breakout events are also exposed with confirmation naming in metadata.
  const eventType =
    timeframe === 'M15' && transition.eventType === 'orb_high_broken'
      ? 'orb_high_broken'
      : timeframe === 'M15' && transition.eventType === 'orb_low_broken'
        ? 'orb_low_broken'
        : transition.eventType

  return {
    id: randomUUID(),
    instrumentId: record.symbolId,
    symbol: record.symbolName,
    instrumentName: record.displayName,
    openingProfileId: record.profileId,
    openingProfileName: record.profileName,
    tradingDate: record.tradingDate,
    eventType,
    timeframe,
    direction: marketEventDirectionFor(eventType),
    occurredAt: transition.candleCloseTime,
    candleOpenTime: transition.candleOpenTime,
    candleCloseTime: transition.candleCloseTime,
    closePrice: transition.closePrice,
    orbHigh: record.openingRange?.high,
    orbLow: record.openingRange?.low,
    manipulationCategory: manipulationCategoryFor(record),
    tradingWindowActive: windowActive,
    extendedMonitoringAllowed: extendedAllowed,
    notificationEligible,
    qualified,
    metadata: {
      source: 'candle_close',
      fromZone: transition.from,
      toZone: transition.to,
      attentionEligible: windowAllows,
      ...(timeframe === 'M15' && eventType === 'orb_high_broken'
        ? { confirmationType: 'm15_orb_high_confirmed' }
        : {}),
      ...(timeframe === 'M15' && eventType === 'orb_low_broken'
        ? { confirmationType: 'm15_orb_low_confirmed' }
        : {}),
    },
  }
}

function handleTick(tick: LiveTick): void {
  let dirty = false
  for (const [key, record] of monitors) {
    if (record.symbolId !== tick.symbolId) continue
    if (record.phase !== 'monitoring' || !record.openingRange) continue

    const state =
      breakoutRuntime.get(key) ??
      createBreakoutState({
        upsideAlerted: record.upsideAlertAt != null,
        downsideAlerted: record.downsideAlertAt != null,
      })

    const { signals, state: next } = applyTick(
      state,
      record.openingRange.high,
      record.openingRange.low,
      tick.bid,
      tick.ask,
    )
    breakoutRuntime.set(key, next)
    if (signals.length === 0) continue

    // Tick crossings still latch factual upside/downside timestamps for
    // restart-safe live monitoring. Trader-facing Market Events are produced
    // from completed candle closes (including Returned to ORB).
    const nowIso = new Date().toISOString()
    for (const signal of signals) {
      if (signal.direction === 'up') record.upsideAlertAt = nowIso
      else record.downsideAlertAt = nowIso
      record.updatedAt = nowIso
      logger.info(
        `ORB tick cross (awaiting candle close event): ${record.symbolName} / ${record.profileName} / ${signal.direction}`,
      )
    }
    monitors.set(key, record)
    dirty = true
  }
  if (dirty) schedulePersist()
}

export interface OrbEngineState {
  running: boolean
  connected: boolean
  subscribedSymbols: string[]
  monitors: OrbMonitorRecord[]
  /** Canonical newest-first market activity. */
  events: MarketEvent[]
  /** Backward-compatible projection of market events. */
  alerts: OrbAlert[]
}

export function getOrbEngineState(): OrbEngineState {
  const snapshot = getLatestLiveSpotSnapshot()
  const sorted = [...monitors.values()].sort((a, b) => {
    if (a.symbolName !== b.symbolName) return a.symbolName.localeCompare(b.symbolName)
    if (a.tradingDate !== b.tradingDate) return b.tradingDate.localeCompare(a.tradingDate)
    return a.profileName.localeCompare(b.profileName)
  })
  const eventsNewestFirst = [...marketEvents].reverse()
  return {
    running: started,
    connected: snapshot.connected,
    subscribedSymbols: getSubscribedSpotSymbols(),
    monitors: sorted,
    events: eventsNewestFirst,
    alerts: eventsNewestFirst.map((event) => marketEventToOrbAlert(event)),
  }
}

export function listMarketEvents(filters: {
  limit?: number
  instrumentId?: string
  openingProfileId?: string
  eventType?: string
  timeframe?: string
  from?: string
  to?: string
} = {}): MarketEvent[] {
  let events = [...marketEvents].reverse()
  if (filters.instrumentId) {
    events = events.filter((event) => event.instrumentId === filters.instrumentId)
  }
  if (filters.openingProfileId) {
    events = events.filter((event) => event.openingProfileId === filters.openingProfileId)
  }
  if (filters.eventType) {
    events = events.filter((event) => event.eventType === filters.eventType)
  }
  if (filters.timeframe) {
    events = events.filter((event) => event.timeframe === filters.timeframe)
  }
  if (filters.from) {
    const fromMs = Date.parse(filters.from)
    if (Number.isFinite(fromMs)) {
      events = events.filter((event) => Date.parse(event.occurredAt) >= fromMs)
    }
  }
  if (filters.to) {
    const toMs = Date.parse(filters.to)
    if (Number.isFinite(toMs)) {
      events = events.filter((event) => Date.parse(event.occurredAt) <= toMs)
    }
  }
  const limit = filters.limit && filters.limit > 0 ? filters.limit : events.length
  return events.slice(0, limit)
}

/** Test-only reset. */
export function __resetOrbEngine(): void {
  stopOrbEngine()
  monitors.clear()
  breakoutRuntime.clear()
  capturing.clear()
  refreshingBreakouts.clear()
  profilesById.clear()
  marketEvents = []
  eventDedupeKeys.clear()
}
