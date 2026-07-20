import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  CTRADER_AUTH_ERROR,
  CTRADER_AUTH_SUCCESS,
  CTRADER_OAUTH_ORIGIN,
  isCTraderAuthMessage,
  startCTraderOAuth,
} from '../services/ctraderOAuth'
import { isCTraderConnectable, type CTraderServiceStatus } from '../utils/ctraderConnectable'

export type { CTraderServiceStatus } from '../utils/ctraderConnectable'

interface CTraderStatusContextValue {
  status: CTraderServiceStatus
  configured: boolean
  connected: boolean
  notice: string | null
  clearNotice: () => void
  refreshStatus: () => Promise<void>
  startConnect: () => void
  canConnect: boolean
}

const CTraderStatusContext = createContext<CTraderStatusContextValue | null>(null)

function isServiceStatus(value: unknown): value is CTraderServiceStatus {
  return (
    value === 'connected' ||
    value === 'not_connected' ||
    value === 'not_configured' ||
    value === 'connection_expired' ||
    value === 'error'
  )
}

export function CTraderStatusProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<CTraderServiceStatus>('not_connected')
  const [configured, setConfigured] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const popupRef = useRef<Window | null>(null)
  const closeWatchRef = useRef<number | null>(null)

  const clearCloseWatch = useCallback(() => {
    if (closeWatchRef.current !== null) {
      window.clearInterval(closeWatchRef.current)
      closeWatchRef.current = null
    }
  }, [])

  const refreshStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/status')
      if (!response.ok) throw new Error('Status request failed')
      const payload = await response.json() as {
        services?: { ctrader?: { status?: unknown; configured?: unknown } }
      }
      const nextStatus = payload.services?.ctrader?.status
      const nextConfigured = payload.services?.ctrader?.configured === true
      if (isServiceStatus(nextStatus)) {
        setStatus(nextStatus)
        setConfigured(nextConfigured)
        return
      }
      setStatus('error')
      setConfigured(nextConfigured)
    } catch {
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    void refreshStatus()
    const timer = window.setInterval(() => {
      void refreshStatus()
    }, 30_000)
    return () => window.clearInterval(timer)
  }, [refreshStatus])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== CTRADER_OAUTH_ORIGIN) return
      if (!isCTraderAuthMessage(event.data)) return

      if (event.data.type === CTRADER_AUTH_SUCCESS) {
        clearCloseWatch()
        if (popupRef.current && !popupRef.current.closed) popupRef.current.close()
        popupRef.current = null
        void refreshStatus()
        setNotice('cTrader connected successfully.')
        return
      }

      if (event.data.type === CTRADER_AUTH_ERROR) {
        clearCloseWatch()
        popupRef.current = null
        setNotice(event.data.message || 'Failed to connect to cTrader.')
      }
    }

    window.addEventListener('message', onMessage)
    return () => {
      window.removeEventListener('message', onMessage)
      clearCloseWatch()
    }
  }, [clearCloseWatch, refreshStatus])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 5000)
    return () => window.clearTimeout(timer)
  }, [notice])

  const startConnect = useCallback(() => {
    clearCloseWatch()
    const result = startCTraderOAuth()
    if (result.mode === 'tab') {
      popupRef.current = null
      setNotice(result.message)
      return
    }

    popupRef.current = result.popup
    closeWatchRef.current = window.setInterval(() => {
      if (!popupRef.current || popupRef.current.closed) {
        popupRef.current = null
        clearCloseWatch()
      }
    }, 750)
  }, [clearCloseWatch])

  const value = useMemo<CTraderStatusContextValue>(() => ({
    status,
    configured,
    connected: status === 'connected',
    notice,
    clearNotice: () => setNotice(null),
    refreshStatus,
    startConnect,
    canConnect: isCTraderConnectable(status, configured),
  }), [status, configured, notice, refreshStatus, startConnect])

  return <CTraderStatusContext.Provider value={value}>{children}</CTraderStatusContext.Provider>
}

export function useCTraderStatus() {
  const context = useContext(CTraderStatusContext)
  if (!context) throw new Error('useCTraderStatus must be used inside CTraderStatusProvider')
  return context
}
