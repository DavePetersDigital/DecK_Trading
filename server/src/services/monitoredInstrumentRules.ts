// Pure model + validation rules for the monitored-instrument registry.
// This module intentionally has no imports so it can be unit tested in
// isolation and reused by both persistence and the monitor-facing service.

export type MonitoredSessionKey = 'asia' | 'london' | 'newYork'
export type ManipulationMode = 'normal' | 'gold_specific'

export const MONITORED_SESSION_KEYS: readonly MonitoredSessionKey[] = ['asia', 'london', 'newYork']
export const MANIPULATION_MODES: readonly ManipulationMode[] = ['normal', 'gold_specific']

// Entry and ORB timeframes are locked for this stage of the product.
export const ENTRY_TIMEFRAME = 'M5' as const
export const ORB_TIMEFRAME = 'M15' as const

export const GOLD_SYMBOL_NAME = 'XAUUSD'

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
  /** Legacy session flags, retained for backward compatibility / migration. */
  sessions: MonitoredInstrumentSessions
  /** Opening Profiles this instrument is monitored against (engine source of truth). */
  openingProfileIds: string[]
  entryTimeframe: typeof ENTRY_TIMEFRAME
  orbTimeframe: typeof ORB_TIMEFRAME
  manipulationMode: ManipulationMode
  createdAt: string
  updatedAt: string
}

export interface MonitoredInstrumentInput {
  symbolId?: unknown
  symbolName?: unknown
  displayName?: unknown
  enabled?: unknown
  sessions?: unknown
  openingProfileIds?: unknown
  entryTimeframe?: unknown
  orbTimeframe?: unknown
  manipulationMode?: unknown
}

export interface MonitoredInstrumentPatch {
  displayName?: unknown
  enabled?: unknown
  sessions?: unknown
  openingProfileIds?: unknown
  entryTimeframe?: unknown
  orbTimeframe?: unknown
  manipulationMode?: unknown
}

// Migration mapping from the legacy session model to default Opening Profiles.
const SESSION_TO_PROFILE_ID: Record<MonitoredSessionKey, string> = {
  asia: 'tokyo-fx',
  london: 'london-fx',
  newYork: 'new-york-fx',
}

export function defaultProfileIdsFromSessions(sessions: MonitoredInstrumentSessions): string[] {
  return enabledSessionKeys(sessions).map((key) => SESSION_TO_PROFILE_ID[key])
}

export function normalizeOpeningProfileIds(raw: unknown, fallback: string[]): string[] {
  if (raw === undefined || raw === null) return [...fallback]
  if (!Array.isArray(raw)) {
    throw new MonitoredInstrumentValidationError('openingProfileIds must be an array of profile ids.')
  }
  const seen = new Set<string>()
  const ids: string[] = []
  for (const entry of raw) {
    const value = typeof entry === 'string' ? entry.trim() : ''
    if (!value || seen.has(value)) continue
    seen.add(value)
    ids.push(value)
  }
  return ids
}

export class MonitoredInstrumentValidationError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message)
    this.name = 'MonitoredInstrumentValidationError'
  }
}

/** Gold-specific manipulation mode is only ever permitted for XAUUSD. */
export function isGoldSymbol(symbolName: string): boolean {
  return symbolName.trim().toUpperCase() === GOLD_SYMBOL_NAME
}

function coerceBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value
  return fallback
}

export function sanitizeSymbolId(raw: unknown): string {
  const value = typeof raw === 'string' ? raw.trim() : typeof raw === 'number' ? String(raw) : ''
  if (!/^\d+$/.test(value)) {
    throw new MonitoredInstrumentValidationError('symbolId must be a numeric cTrader symbol identifier.')
  }
  return value
}

export function sanitizeSymbolName(raw: unknown): string {
  const value = typeof raw === 'string' ? raw.trim().toUpperCase() : ''
  if (!value || !/^[A-Z0-9._-]+$/.test(value)) {
    throw new MonitoredInstrumentValidationError('symbolName is missing or contains unsupported characters.')
  }
  return value
}

/**
 * Normalise a sessions object into the fixed {asia, london, newYork} shape.
 * Unknown keys are ignored; missing keys default to `fallback`.
 */
export function normalizeSessions(
  raw: unknown,
  fallback: MonitoredInstrumentSessions = { asia: false, london: false, newYork: false },
): MonitoredInstrumentSessions {
  const source = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {}
  if (raw != null && (typeof raw !== 'object' || Array.isArray(raw))) {
    throw new MonitoredInstrumentValidationError('sessions must be an object of session flags.')
  }
  return {
    asia: coerceBoolean(source.asia, fallback.asia),
    london: coerceBoolean(source.london, fallback.london),
    newYork: coerceBoolean(source.newYork, fallback.newYork),
  }
}

export function hasEnabledSession(sessions: MonitoredInstrumentSessions): boolean {
  return MONITORED_SESSION_KEYS.some((key) => sessions[key])
}

export function enabledSessionKeys(sessions: MonitoredInstrumentSessions): MonitoredSessionKey[] {
  return MONITORED_SESSION_KEYS.filter((key) => sessions[key])
}

/**
 * Gold-specific is normalised to normal for any non-XAUUSD instrument.
 * Unknown modes fall back to normal (the default for every instrument).
 */
export function normalizeManipulationMode(symbolName: string, requested: unknown): ManipulationMode {
  if (requested === 'gold_specific') {
    return isGoldSymbol(symbolName) ? 'gold_specific' : 'normal'
  }
  if (requested === 'normal' || requested === undefined || requested === null) {
    return 'normal'
  }
  throw new MonitoredInstrumentValidationError(
    `manipulationMode must be one of: ${MANIPULATION_MODES.join(', ')}.`,
  )
}

function assertTimeframe(field: 'entryTimeframe' | 'orbTimeframe', value: unknown, locked: string) {
  if (value === undefined || value === null) return
  if (value !== locked) {
    throw new MonitoredInstrumentValidationError(`${field} must remain ${locked}.`)
  }
}

/** Build a fully-normalised instrument record from untrusted input. */
export function buildMonitoredInstrument(
  input: MonitoredInstrumentInput,
  now: string,
): MonitoredInstrument {
  const symbolId = sanitizeSymbolId(input.symbolId)
  const symbolName = sanitizeSymbolName(input.symbolName)
  assertTimeframe('entryTimeframe', input.entryTimeframe, ENTRY_TIMEFRAME)
  assertTimeframe('orbTimeframe', input.orbTimeframe, ORB_TIMEFRAME)

  const enabled = coerceBoolean(input.enabled, true)
  const sessions = normalizeSessions(
    input.sessions,
    // A newly added instrument monitors every session unless told otherwise.
    { asia: true, london: true, newYork: true },
  )
  if (enabled && !hasEnabledSession(sessions)) {
    throw new MonitoredInstrumentValidationError('An enabled instrument must have at least one session enabled.')
  }

  const displayName = typeof input.displayName === 'string' && input.displayName.trim()
    ? input.displayName.trim()
    : symbolName

  const openingProfileIds = normalizeOpeningProfileIds(
    input.openingProfileIds,
    defaultProfileIdsFromSessions(sessions),
  )
  if (enabled && openingProfileIds.length === 0) {
    throw new MonitoredInstrumentValidationError('An enabled instrument must reference at least one Opening Profile.')
  }

  return {
    symbolId,
    symbolName,
    displayName,
    enabled,
    sessions,
    openingProfileIds,
    entryTimeframe: ENTRY_TIMEFRAME,
    orbTimeframe: ORB_TIMEFRAME,
    manipulationMode: normalizeManipulationMode(symbolName, input.manipulationMode),
    createdAt: now,
    updatedAt: now,
  }
}

/** Apply a partial patch to an existing record, keeping immutable fields fixed. */
export function applyMonitoredInstrumentPatch(
  existing: MonitoredInstrument,
  patch: MonitoredInstrumentPatch,
  now: string,
): MonitoredInstrument {
  assertTimeframe('entryTimeframe', patch.entryTimeframe, ENTRY_TIMEFRAME)
  assertTimeframe('orbTimeframe', patch.orbTimeframe, ORB_TIMEFRAME)

  const enabled = patch.enabled === undefined ? existing.enabled : coerceBoolean(patch.enabled, existing.enabled)
  const sessions = patch.sessions === undefined
    ? existing.sessions
    : normalizeSessions(patch.sessions, existing.sessions)

  if (enabled && !hasEnabledSession(sessions)) {
    throw new MonitoredInstrumentValidationError('An enabled instrument must have at least one session enabled.')
  }

  const displayName = patch.displayName === undefined
    ? existing.displayName
    : (typeof patch.displayName === 'string' && patch.displayName.trim()
      ? patch.displayName.trim()
      : existing.displayName)

  const manipulationMode = patch.manipulationMode === undefined
    ? normalizeManipulationMode(existing.symbolName, existing.manipulationMode)
    : normalizeManipulationMode(existing.symbolName, patch.manipulationMode)

  // Keep Opening Profiles in sync: explicit ids win; otherwise, when sessions
  // change, re-derive from the new sessions so the legacy UI stays functional.
  const existingProfileIds = existing.openingProfileIds ?? defaultProfileIdsFromSessions(existing.sessions)
  let openingProfileIds: string[]
  if (patch.openingProfileIds !== undefined) {
    openingProfileIds = normalizeOpeningProfileIds(patch.openingProfileIds, existingProfileIds)
  } else if (patch.sessions !== undefined) {
    openingProfileIds = defaultProfileIdsFromSessions(sessions)
  } else {
    openingProfileIds = existingProfileIds
  }

  if (enabled && openingProfileIds.length === 0) {
    throw new MonitoredInstrumentValidationError('An enabled instrument must reference at least one Opening Profile.')
  }

  return {
    ...existing,
    displayName,
    enabled,
    sessions,
    openingProfileIds,
    manipulationMode,
    entryTimeframe: ENTRY_TIMEFRAME,
    orbTimeframe: ORB_TIMEFRAME,
    updatedAt: now,
  }
}

/** Coerce a persisted (possibly legacy/partial) record into a valid instrument. */
export function normalizeStoredInstrument(raw: unknown, now: string): MonitoredInstrument | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  try {
    const symbolId = sanitizeSymbolId(record.symbolId)
    const symbolName = sanitizeSymbolName(record.symbolName)
    const sessions = normalizeSessions(record.sessions, { asia: true, london: true, newYork: true })
    const enabled = coerceBoolean(record.enabled, true)
    const displayName = typeof record.displayName === 'string' && record.displayName.trim()
      ? record.displayName.trim()
      : symbolName
    const createdAt = typeof record.createdAt === 'string' ? record.createdAt : now
    const updatedAt = typeof record.updatedAt === 'string' ? record.updatedAt : now
    const openingProfileIds = normalizeOpeningProfileIds(
      record.openingProfileIds,
      defaultProfileIdsFromSessions(sessions),
    )
    return {
      symbolId,
      symbolName,
      displayName,
      enabled,
      sessions,
      openingProfileIds,
      entryTimeframe: ENTRY_TIMEFRAME,
      orbTimeframe: ORB_TIMEFRAME,
      manipulationMode: normalizeManipulationMode(symbolName, record.manipulationMode),
      createdAt,
      updatedAt,
    }
  } catch {
    return null
  }
}
