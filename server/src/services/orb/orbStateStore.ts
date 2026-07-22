// Restart-safe persistence for the ORB engine: per-monitor state and the
// recent market-event log. Legacy OrbAlert records are migrated into MarketEvents.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { logger } from '../../utils/logger.js'
import type { AlertMode, ProfileManipulationMode } from '../openingProfile/openingProfileRules.js'
import type { OpeningDirection, OpeningRange } from '../openingRange/openingRangeRules.js'
import type { ManipulationClassification, ManipulationResult } from '../manipulation/manipulationTypes.js'
import type { TrendSnapshot } from '../trend/trendEngine.js'
import {
  marketEventDirectionFor,
  marketEventDedupeKey,
  type MarketEvent,
  type MarketEventManipulation,
} from './marketEvent.js'
import { normalizeZoneSnapshot, type OrbZoneSnapshot } from './orbZoneState.js'

const projectRoot = fileURLToPath(new URL('../../../../', import.meta.url))
const DATA_DIR = join(projectRoot, 'data')
const DATA_FILE = join(DATA_DIR, 'orb-state.json')

const STORE_VERSION = 2
export const MAX_STORED_EVENTS = 200
/** @deprecated Use MAX_STORED_EVENTS. Kept for callers that still reference the old name. */
export const MAX_STORED_ALERTS = MAX_STORED_EVENTS

export type OrbMonitorPhase =
  | 'waiting' // opening time not yet reached today
  | 'awaiting_candle' // opening reached, first M15 candle still forming
  | 'monitoring' // opening range captured, watching for breakout
  | 'no_data' // opening candle unavailable from cTrader
  | 'complete' // trading date finished

/** @deprecated Prefer OrbZoneSnapshot. Alias retained for older imports. */
export type CandleBreakoutSnapshot = OrbZoneSnapshot

export interface OrbMonitorRecord {
  key: string
  symbolId: string
  symbolName: string
  displayName: string
  profileId: string
  profileName: string
  manipulationMode: ProfileManipulationMode
  /** ORB strategy: alert on every breakout vs only on manipulation. */
  alertMode: AlertMode
  tradingDate: string
  openingInstantUtc: string
  openingCandleCloseUtc: string
  /** Profile market-session close (UTC). */
  closingInstantUtc: string
  tradingWindowMinutes: number
  allowTradesAfterWindow: boolean
  tradingWindowEndUtc: string
  phase: OrbMonitorPhase
  openingRange: OpeningRange | null
  manipulation: ManipulationResult | null
  trend: TrendSnapshot | null
  /** Completed M5 candle ORB zone state. */
  m5Breakout: OrbZoneSnapshot | null
  /** Completed M15 candle ORB zone state. */
  m15Breakout: OrbZoneSnapshot | null
  /** Timestamps at which live tick first crossed ORB high/low (legacy monitor). */
  upsideAlertAt: string | null
  downsideAlertAt: string | null
  updatedAt: string
}

/**
 * Legacy breakout alert shape kept for API backward compatibility.
 * New activity is stored as MarketEvent; OrbAlert is derived when needed.
 */
export interface OrbAlert {
  id: string
  symbolId: string
  instrument: string
  displayName: string
  profileId: string
  openingProfile: string
  tradingDate: string
  event: 'ORB Breakout' | 'Returned to ORB'
  direction: 'Up' | 'Down' | 'Neutral'
  triggerPrice: number
  orbHigh: number
  orbLow: number
  openingCandleDirection: OpeningDirection
  manipulation: boolean | null
  manipulationMode: ProfileManipulationMode
  classification: ManipulationClassification
  rank: number | null
  trend: 'bullish' | 'bearish' | null
  timeUtc: string
  message: string
  /** Present when this alert was projected from a MarketEvent. */
  marketEventType?: MarketEvent['eventType']
  timeframe?: MarketEvent['timeframe']
}

export interface OrbStateFile {
  version: number
  monitors: OrbMonitorRecord[]
  events: MarketEvent[]
  /** Legacy field retained for migration of older on-disk files. */
  alerts?: OrbAlert[]
}

let writeChain: Promise<void> = Promise.resolve()

function manipulationCategoryFrom(
  manipulation: boolean | null | undefined,
  classification: ManipulationClassification | null | undefined,
): MarketEventManipulation | null {
  if (manipulation === false) return 'no'
  if (manipulation !== true) return null
  if (classification === 'EXTREME') return 'extreme'
  if (classification === 'LARGE') return 'large'
  return 'normal'
}

export function migrateOrbAlertToMarketEvent(alert: OrbAlert): MarketEvent {
  const eventType =
    alert.marketEventType ??
    (alert.event === 'Returned to ORB'
      ? 'returned_to_orb'
      : alert.direction === 'Down'
        ? 'orb_low_broken'
        : 'orb_high_broken')
  const timeframe = alert.timeframe ?? 'M5'
  const candleCloseTime = alert.timeUtc
  return {
    id: alert.id || randomUUID(),
    instrumentId: alert.symbolId,
    symbol: alert.instrument,
    instrumentName: alert.displayName || alert.instrument,
    openingProfileId: alert.profileId,
    openingProfileName: alert.openingProfile,
    tradingDate: alert.tradingDate,
    eventType,
    timeframe,
    direction: marketEventDirectionFor(eventType),
    occurredAt: alert.timeUtc,
    candleCloseTime,
    closePrice: alert.triggerPrice,
    orbHigh: alert.orbHigh,
    orbLow: alert.orbLow,
    manipulationCategory: manipulationCategoryFrom(alert.manipulation, alert.classification),
    tradingWindowActive: true,
    extendedMonitoringAllowed: true,
    notificationEligible: true,
    qualified: alert.manipulation === true,
    metadata: { migratedFrom: 'OrbAlert' },
  }
}

export function marketEventToOrbAlert(
  event: MarketEvent,
  extras: {
    openingCandleDirection?: OpeningDirection
    manipulationMode?: ProfileManipulationMode
    classification?: ManipulationClassification
    rank?: number | null
    trend?: 'bullish' | 'bearish' | null
    manipulation?: boolean | null
  } = {},
): OrbAlert {
  const direction: OrbAlert['direction'] =
    event.direction === 'bullish' ? 'Up' : event.direction === 'bearish' ? 'Down' : 'Neutral'
  const eventName: OrbAlert['event'] =
    event.eventType === 'returned_to_orb' ? 'Returned to ORB' : 'ORB Breakout'
  const manipLabel =
    event.manipulationCategory === 'no'
      ? 'Manipulation No'
      : event.manipulationCategory
        ? `Manipulation ${event.manipulationCategory[0]!.toUpperCase()}${event.manipulationCategory.slice(1)}`
        : 'Manipulation —'
  const typeLabel =
    event.eventType === 'orb_high_broken'
      ? 'ORB High Broken'
      : event.eventType === 'orb_low_broken'
        ? 'ORB Low Broken'
        : event.eventType === 'returned_to_orb'
          ? 'Returned to ORB'
          : event.eventType

  return {
    id: event.id,
    symbolId: event.instrumentId,
    instrument: event.symbol,
    displayName: event.instrumentName,
    profileId: event.openingProfileId,
    openingProfile: event.openingProfileName,
    tradingDate: event.tradingDate,
    event: eventName,
    direction,
    triggerPrice: event.closePrice ?? 0,
    orbHigh: event.orbHigh ?? 0,
    orbLow: event.orbLow ?? 0,
    openingCandleDirection: extras.openingCandleDirection ?? 'doji',
    manipulation: extras.manipulation ?? (event.manipulationCategory === 'no' ? false : event.manipulationCategory ? true : null),
    manipulationMode: extras.manipulationMode ?? 'normal',
    classification: extras.classification ?? 'PENDING_IMPLEMENTATION',
    rank: extras.rank ?? null,
    trend: extras.trend ?? null,
    timeUtc: event.occurredAt,
    message: `${typeLabel} · ${event.timeframe} · ${manipLabel}`,
    marketEventType: event.eventType,
    timeframe: event.timeframe,
  }
}

function normalizeMonitor(raw: OrbMonitorRecord): OrbMonitorRecord {
  return {
    ...raw,
    m5Breakout: raw.m5Breakout ? normalizeZoneSnapshot(raw.m5Breakout) : raw.m5Breakout,
    m15Breakout: raw.m15Breakout ? normalizeZoneSnapshot(raw.m15Breakout) : raw.m15Breakout,
  }
}

function dedupeEvents(events: MarketEvent[]): MarketEvent[] {
  const seen = new Set<string>()
  const out: MarketEvent[] = []
  for (const event of events) {
    const key =
      event.candleCloseTime != null
        ? marketEventDedupeKey({
            instrumentId: event.instrumentId,
            openingProfileId: event.openingProfileId,
            tradingDate: event.tradingDate,
            timeframe: event.timeframe,
            eventType: event.eventType,
            candleCloseTime: event.candleCloseTime,
          })
        : event.id
    if (seen.has(key)) continue
    seen.add(key)
    out.push(event)
  }
  return out
}

export async function readOrbState(): Promise<OrbStateFile> {
  try {
    const raw = await readFile(DATA_FILE, 'utf8')
    const parsed = JSON.parse(raw) as Partial<OrbStateFile>
    const monitors = Array.isArray(parsed.monitors) ? parsed.monitors.map(normalizeMonitor) : []
    const migratedFromAlerts = Array.isArray(parsed.alerts)
      ? parsed.alerts.map(migrateOrbAlertToMarketEvent)
      : []
    const storedEvents = Array.isArray(parsed.events) ? parsed.events : []
    const events = dedupeEvents([...migratedFromAlerts, ...storedEvents]).slice(-MAX_STORED_EVENTS)
    return {
      version: STORE_VERSION,
      monitors,
      events,
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code && code !== 'ENOENT') {
      logger.error('Failed to read ORB engine state; starting fresh.', error)
    }
    return { version: STORE_VERSION, monitors: [], events: [] }
  }
}

export async function writeOrbState(monitors: OrbMonitorRecord[], events: MarketEvent[]): Promise<void> {
  const payload: OrbStateFile = {
    version: STORE_VERSION,
    monitors,
    events: events.slice(-MAX_STORED_EVENTS),
  }
  const serialized = `${JSON.stringify(payload, null, 2)}\n`

  const run = writeChain.then(async () => {
    await mkdir(DATA_DIR, { recursive: true })
    const tempFile = `${DATA_FILE}.${process.pid}.${Date.now()}.tmp`
    await writeFile(tempFile, serialized, 'utf8')
    await rename(tempFile, DATA_FILE)
  })

  writeChain = run.catch(() => undefined)
  await run
}

export { DATA_FILE as ORB_STATE_FILE }
