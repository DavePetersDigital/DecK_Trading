import { createContext } from 'react'
import type { SessionSnapshot } from '../types/session'

export const SessionContext = createContext<SessionSnapshot | null>(null)
