export type MonitoredSessionKey = 'asia' | 'london' | 'newYork'
export type ManipulationMode = 'normal' | 'gold_specific'

export interface MonitoredInstrumentSessions {
  asia: boolean
  london: boolean
  newYork: boolean
}

export interface MonitoredInstrument {
  symbolId: string
  symbolName: string
  displayName: string
  enabled: boolean
  /** @deprecated Legacy session flags; Opening Profiles are the source of truth. */
  sessions: MonitoredInstrumentSessions
  openingProfileIds: string[]
  entryTimeframe: 'M5'
  orbTimeframe: 'M15'
  manipulationMode: ManipulationMode
  createdAt: string
  updatedAt: string
}

export interface MonitoredInstrumentInput {
  symbolId: string
  symbolName: string
  displayName?: string
  enabled?: boolean
  sessions?: Partial<MonitoredInstrumentSessions>
  openingProfileIds?: string[]
  manipulationMode?: ManipulationMode
}

export interface MonitoredInstrumentPatch {
  displayName?: string
  enabled?: boolean
  sessions?: Partial<MonitoredInstrumentSessions>
  openingProfileIds?: string[]
  manipulationMode?: ManipulationMode
}

interface ListResponse {
  success: boolean
  instruments?: MonitoredInstrument[]
  error?: string
}

interface SingleResponse {
  success: boolean
  instrument?: MonitoredInstrument
  error?: string
}

async function parseJson<T>(response: Response): Promise<T> {
  try {
    return await response.json() as T
  } catch {
    throw new Error(`Unexpected response from the server (${response.status}).`)
  }
}

export async function fetchMonitoredInstruments(): Promise<MonitoredInstrument[]> {
  const response = await fetch('/api/instruments/monitored')
  const payload = await parseJson<ListResponse>(response)
  if (!response.ok || !payload.success) {
    throw new Error(payload.error || `Failed to load monitored instruments (${response.status}).`)
  }
  return payload.instruments ?? []
}

export async function createMonitoredInstrument(input: MonitoredInstrumentInput): Promise<MonitoredInstrument> {
  const response = await fetch('/api/instruments/monitored', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const payload = await parseJson<SingleResponse>(response)
  if (!response.ok || !payload.success || !payload.instrument) {
    throw new Error(payload.error || `Failed to add monitored instrument (${response.status}).`)
  }
  return payload.instrument
}

export async function patchMonitoredInstrument(
  symbolId: string,
  patch: MonitoredInstrumentPatch,
): Promise<MonitoredInstrument> {
  const response = await fetch(`/api/instruments/monitored/${encodeURIComponent(symbolId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  const payload = await parseJson<SingleResponse>(response)
  if (!response.ok || !payload.success || !payload.instrument) {
    throw new Error(payload.error || `Failed to update monitored instrument (${response.status}).`)
  }
  return payload.instrument
}

export async function deleteMonitoredInstrument(symbolId: string): Promise<void> {
  const response = await fetch(`/api/instruments/monitored/${encodeURIComponent(symbolId)}`, {
    method: 'DELETE',
  })
  const payload = await parseJson<{ success: boolean; error?: string }>(response)
  if (!response.ok || !payload.success) {
    throw new Error(payload.error || `Failed to remove monitored instrument (${response.status}).`)
  }
}

export const MONITORED_SESSION_LABELS: Record<MonitoredSessionKey, string> = {
  asia: 'Asia',
  london: 'London',
  newYork: 'New York',
}

export const MONITORED_SESSION_ORDER: MonitoredSessionKey[] = ['asia', 'london', 'newYork']
