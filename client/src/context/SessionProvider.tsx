import { useEffect, useMemo, useState } from 'react'
import { defaultSessionConfiguration } from '../config/sessionConfiguration'
import { buildSessionSnapshot, SESSION_ENGINE_TICK_MS } from '../services/sessionEngine'
import type { SessionConfiguration } from '../types/session'
import { SessionContext } from './sessionContextValue'

export function SessionProvider({
  children,
  configuration = defaultSessionConfiguration,
}: {
  children: React.ReactNode
  configuration?: SessionConfiguration
}) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), SESSION_ENGINE_TICK_MS)
    return () => window.clearInterval(timer)
  }, [])

  const snapshot = useMemo(() => buildSessionSnapshot(now, configuration), [now, configuration])

  return <SessionContext.Provider value={snapshot}>{children}</SessionContext.Provider>
}
