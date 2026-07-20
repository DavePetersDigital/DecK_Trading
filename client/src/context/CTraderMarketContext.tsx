import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useCTraderStatus } from './CTraderStatusContext'
import { useInstrumentStore } from './InstrumentContext'
import { useSession } from '../hooks/useSession'
import { fetchCTraderHistory } from '../services/ctraderApi'
import { selectLatestCompletedM5Candle } from '../services/ctraderMarketData'
import { CTRADER_AUTH_SUCCESS, CTRADER_OAUTH_ORIGIN, isCTraderAuthMessage } from '../services/ctraderOAuth'
import { hasActiveMonitoredSession } from '../utils/instrumentSessions'

export const XAUUSD_CTRADER_SYMBOL_ID = '41'
export const XAUUSD_SYMBOL_NAME = 'XAUUSD'
const M5_FALLBACK_POLL_MS = 60_000
const HISTORY_COUNT = 5
const LIVE_STALE_MS = 30_000
const RECONNECT_BASE_MS = 1_000
const RECONNECT_MAX_MS = 15_000

export type MarketSource = 'ctrader_live' | 'ctrader_history' | null
export type MarketFreshness = 'live' | 'latest_completed_candle' | 'stale' | 'fallback' | null

export interface CTraderMarketSnapshot {
  symbolId: string
  symbolName: string
  price: number | null
  bid: number | null
  ask: number | null
  spread: number | null
  candleTime: string | null
  timeframe: 'M5'
  timestamp: string | null
  source: MarketSource
  freshness: MarketFreshness
  loading: boolean
  stale: boolean
  error: string | null
  sourceLabel: string
}

interface CTraderMarketContextValue extends CTraderMarketSnapshot {
  refreshMarket: () => Promise<void>
}

interface LiveTick {
  mid: number
  bid: number | null
  ask: number | null
  spread: number | null
  timestamp: string
  receivedAt: number
}

interface M5Fallback {
  price: number
  candleTime: string
}

interface LiveStreamPayload {
  bid?: number | null
  ask?: number | null
  mid?: number | null
  spread?: number | null
  timestamp?: string | null
  status?: string
  error?: string | null
  message?: string
}

const defaultSnapshot: CTraderMarketSnapshot = {
  symbolId: XAUUSD_CTRADER_SYMBOL_ID,
  symbolName: XAUUSD_SYMBOL_NAME,
  price: null,
  bid: null,
  ask: null,
  spread: null,
  candleTime: null,
  timeframe: 'M5',
  timestamp: null,
  source: null,
  freshness: null,
  loading: false,
  stale: false,
  error: null,
  sourceLabel: 'CTRADER · DISCONNECTED',
}

const CTraderMarketContext = createContext<CTraderMarketContextValue | null>(null)

function liveTickAgeMs(live: LiveTick, now: number) {
  const providerMs = Date.parse(live.timestamp)
  if (Number.isFinite(providerMs) && providerMs > 0) {
    // Prefer provider event time; receipt time only fills gaps / clock skew.
    return Math.max(0, now - providerMs, now - live.receivedAt)
  }
  return Math.max(0, now - live.receivedAt)
}

function buildSnapshot(params: {
  connected: boolean
  loading: boolean
  error: string | null
  live: LiveTick | null
  m5: M5Fallback | null
  marketActive?: boolean
  now?: number
}): CTraderMarketSnapshot {
  const now = params.now ?? Date.now()
  const marketActive = params.marketActive ?? true
  const liveAge = params.live != null ? liveTickAgeMs(params.live, now) : Number.POSITIVE_INFINITY
  // While the monitored Gold session is closed, missing ticks are soft — not a stream fault.
  const liveStale = params.live != null && liveAge > LIVE_STALE_MS
  const usingLive = params.connected && params.live != null && !liveStale
  const usingFallback = params.connected && !usingLive && params.m5 != null
  const retainingStaleLive = params.connected && params.live != null && liveStale && !usingFallback

  let sourceLabel = 'CTRADER · DISCONNECTED'
  if (!params.connected) sourceLabel = 'CTRADER · DISCONNECTED'
  else if (usingLive) sourceLabel = 'CTRADER · LIVE'
  else if (retainingStaleLive) sourceLabel = 'CTRADER · LIVE STALE'
  else if (usingFallback) sourceLabel = 'CTRADER · M5 FALLBACK'
  else if (params.error && marketActive) sourceLabel = 'CTRADER · STREAM ERROR'
  else if (params.loading) sourceLabel = 'CTRADER · CONNECTING'
  else sourceLabel = 'CTRADER · CONNECTING'

  const price = usingLive || retainingStaleLive
    ? params.live!.mid
    : usingFallback
      ? params.m5!.price
      : null

  return {
    symbolId: XAUUSD_CTRADER_SYMBOL_ID,
    symbolName: XAUUSD_SYMBOL_NAME,
    price,
    bid: params.live?.bid ?? null,
    ask: params.live?.ask ?? null,
    spread: params.live?.spread ?? null,
    candleTime: params.m5?.candleTime ?? null,
    timeframe: 'M5',
    timestamp: usingLive || retainingStaleLive
      ? params.live!.timestamp
      : usingFallback
        ? params.m5!.candleTime
        : null,
    source: usingLive || retainingStaleLive
      ? 'ctrader_live'
      : usingFallback
        ? 'ctrader_history'
        : null,
    freshness: usingLive
      ? 'live'
      : retainingStaleLive || (!marketActive && price != null)
        ? 'stale'
        : usingFallback
          ? 'fallback'
          : null,
    loading: params.loading,
    stale: retainingStaleLive || usingFallback || (!params.connected && price != null),
    error: marketActive ? params.error : null,
    sourceLabel,
  }
}

export function CTraderMarketProvider({ children }: { children: React.ReactNode }) {
  const { connected } = useCTraderStatus()
  const { applyReferencePrice, setInstrumentDataSource, current } = useInstrumentStore()
  const session = useSession()
  const marketActive = hasActiveMonitoredSession(current.config, session.sessions)
  const marketActiveRef = useRef(marketActive)
  marketActiveRef.current = marketActive
  const [snapshot, setSnapshot] = useState<CTraderMarketSnapshot>(defaultSnapshot)
  const liveRef = useRef<LiveTick | null>(null)
  const m5Ref = useRef<M5Fallback | null>(null)
  const loadingRef = useRef(false)
  const errorRef = useRef<string | null>(null)
  const connectedRef = useRef(connected)
  connectedRef.current = connected
  const m5InFlightRef = useRef<Promise<void> | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectAttemptRef = useRef(0)
  const reconnectTimerRef = useRef<number | null>(null)

  const syncSnapshot = useCallback((patch?: {
    loading?: boolean
    error?: string | null
  }) => {
    if (patch?.loading !== undefined) loadingRef.current = patch.loading
    if (patch?.error !== undefined) errorRef.current = patch.error

    const next = buildSnapshot({
      connected: connectedRef.current,
      loading: loadingRef.current,
      error: errorRef.current,
      live: liveRef.current,
      m5: m5Ref.current,
      marketActive: marketActiveRef.current,
    })
    setSnapshot(next)

    if (next.price != null && (next.source === 'ctrader_live' || next.source === 'ctrader_history')) {
      applyReferencePrice(
        XAUUSD_SYMBOL_NAME,
        next.price,
        next.source === 'ctrader_live' && !next.stale ? 'Live' : 'Disconnected',
      )
    } else if (!connectedRef.current) {
      setInstrumentDataSource(XAUUSD_SYMBOL_NAME, 'Disconnected')
    }
  }, [applyReferencePrice, setInstrumentDataSource])

  const refreshM5Fallback = useCallback(async () => {
    if (!connectedRef.current) return
    if (m5InFlightRef.current) return m5InFlightRef.current

    const run = (async () => {
      try {
        const candles = await fetchCTraderHistory({
          symbolId: XAUUSD_CTRADER_SYMBOL_ID,
          timeframe: 'M5',
          count: HISTORY_COUNT,
        })
        const completed = selectLatestCompletedM5Candle(candles)
        if (!completed || !Number.isFinite(completed.close)) return
        m5Ref.current = { price: completed.close, candleTime: completed.time }
        syncSnapshot()
      } catch (error) {
        console.error('[cTrader market fallback]', error instanceof Error ? error.message : error)
      }
    })()

    m5InFlightRef.current = run.finally(() => {
      m5InFlightRef.current = null
    })
    return m5InFlightRef.current
  }, [syncSnapshot])

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current != null) {
      window.clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
  }, [])

  const closeStream = useCallback(() => {
    clearReconnectTimer()
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
  }, [clearReconnectTimer])

  const openStream = useCallback(() => {
    if (!connectedRef.current) return
    if (eventSourceRef.current) return

    syncSnapshot({ loading: true, error: null })
    const source = new EventSource(`/api/market/stream?symbolId=${XAUUSD_CTRADER_SYMBOL_ID}`)
    eventSourceRef.current = source

    const onMarket = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(String(event.data)) as LiveStreamPayload
        if (typeof payload.mid === 'number' && Number.isFinite(payload.mid)) {
          liveRef.current = {
            mid: payload.mid,
            bid: typeof payload.bid === 'number' ? payload.bid : null,
            ask: typeof payload.ask === 'number' ? payload.ask : null,
            spread: typeof payload.spread === 'number' ? payload.spread : null,
            timestamp: payload.timestamp ?? new Date().toISOString(),
            receivedAt: Date.now(),
          }
          reconnectAttemptRef.current = 0
          syncSnapshot({ loading: false, error: null })
          return
        }

        if (payload.status === 'connecting') {
          syncSnapshot({ loading: true, error: null })
          return
        }

        if (payload.status === 'error' || payload.status === 'disconnected') {
          syncSnapshot({
            loading: false,
            error: payload.error ?? payload.message ?? 'Live market stream unavailable.',
          })
        }
      } catch (error) {
        console.error('[cTrader market stream]', error instanceof Error ? error.message : error)
      }
    }

    source.addEventListener('market', onMarket as EventListener)
    source.addEventListener('status', onMarket as EventListener)

    source.onerror = () => {
      source.close()
      if (eventSourceRef.current === source) eventSourceRef.current = null
      if (!connectedRef.current) return

      syncSnapshot({ loading: false, error: 'Live market stream disconnected.' })
      const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * (2 ** reconnectAttemptRef.current))
      reconnectAttemptRef.current += 1
      clearReconnectTimer()
      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null
        openStream()
      }, delay)
    }
  }, [clearReconnectTimer, syncSnapshot])

  const openStreamRef = useRef(openStream)
  openStreamRef.current = openStream
  const closeStreamRef = useRef(closeStream)
  closeStreamRef.current = closeStream
  const refreshM5FallbackRef = useRef(refreshM5Fallback)
  refreshM5FallbackRef.current = refreshM5Fallback
  const syncSnapshotRef = useRef(syncSnapshot)
  syncSnapshotRef.current = syncSnapshot

  useEffect(() => {
    if (!connected) {
      closeStreamRef.current()
      liveRef.current = null
      loadingRef.current = false
      errorRef.current = null
      reconnectAttemptRef.current = 0
      syncSnapshotRef.current()
      return
    }

    void refreshM5FallbackRef.current()
    openStreamRef.current()
    const m5Timer = window.setInterval(() => {
      void refreshM5FallbackRef.current()
    }, M5_FALLBACK_POLL_MS)
    const staleTimer = window.setInterval(() => {
      if (!liveRef.current) return
      if (liveTickAgeMs(liveRef.current, Date.now()) > LIVE_STALE_MS) syncSnapshotRef.current()
    }, 5_000)

    return () => {
      window.clearInterval(m5Timer)
      window.clearInterval(staleTimer)
      closeStreamRef.current()
    }
  }, [connected])

  useEffect(() => {
    syncSnapshotRef.current()
  }, [marketActive])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== CTRADER_OAUTH_ORIGIN) return
      if (!isCTraderAuthMessage(event.data)) return
      if (event.data.type !== CTRADER_AUTH_SUCCESS) return
      reconnectAttemptRef.current = 0
      void refreshM5FallbackRef.current()
      closeStreamRef.current()
      openStreamRef.current()
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  const value = useMemo<CTraderMarketContextValue>(() => ({
    ...snapshot,
    refreshMarket: refreshM5Fallback,
  }), [snapshot, refreshM5Fallback])

  return <CTraderMarketContext.Provider value={value}>{children}</CTraderMarketContext.Provider>
}

export function useCTraderMarketSnapshot() {
  const context = useContext(CTraderMarketContext)
  if (!context) throw new Error('useCTraderMarketSnapshot must be used inside CTraderMarketProvider')
  return context
}
