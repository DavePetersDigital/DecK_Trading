import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { logger } from '../utils/logger.js'
import {
  applyMonitoredInstrumentPatch,
  buildMonitoredInstrument,
  normalizeStoredInstrument,
  type MonitoredInstrument,
  type MonitoredInstrumentInput,
  type MonitoredInstrumentPatch,
  MonitoredInstrumentValidationError,
} from './monitoredInstrumentRules.js'

// Resolve the repository root the same way config/environment.ts does, then
// keep runtime configuration in a git-ignored data directory at the root.
const projectRoot = fileURLToPath(new URL('../../../', import.meta.url))
const DATA_DIR = join(projectRoot, 'data')
const DATA_FILE = join(DATA_DIR, 'monitored-instruments.json')

const STORE_VERSION = 1

interface MonitoredInstrumentFile {
  version: number
  instruments: MonitoredInstrument[]
}

// Initial migration: guarantee the existing XAUUSD (symbol id 41) instrument.
function seedInstruments(now: string): MonitoredInstrument[] {
  return [
    buildMonitoredInstrument(
      {
        symbolId: '41',
        symbolName: 'XAUUSD',
        displayName: 'Gold',
        enabled: true,
        sessions: { asia: true, london: true, newYork: true },
        // Normal is the default until gold-specific is explicitly selected.
        manipulationMode: 'normal',
      },
      now,
    ),
  ]
}

let cache: MonitoredInstrument[] | null = null
// Serialise all writes so concurrent requests cannot interleave file writes.
let writeChain: Promise<void> = Promise.resolve()

async function persist(instruments: MonitoredInstrument[]): Promise<void> {
  const payload: MonitoredInstrumentFile = { version: STORE_VERSION, instruments }
  const serialized = `${JSON.stringify(payload, null, 2)}\n`

  const run = writeChain.then(async () => {
    await mkdir(DATA_DIR, { recursive: true })
    // Atomic write: write to a unique temp file, then rename over the target.
    const tempFile = `${DATA_FILE}.${process.pid}.${Date.now()}.tmp`
    await writeFile(tempFile, serialized, 'utf8')
    await rename(tempFile, DATA_FILE)
  })

  // Keep the chain alive even if a write fails.
  writeChain = run.catch(() => undefined)
  await run
}

async function load(): Promise<MonitoredInstrument[]> {
  if (cache) return cache

  const now = new Date().toISOString()
  try {
    const raw = await readFile(DATA_FILE, 'utf8')
    const parsed = JSON.parse(raw) as Partial<MonitoredInstrumentFile>
    const rawList = Array.isArray(parsed.instruments) ? parsed.instruments : []
    const normalized: MonitoredInstrument[] = []
    const seen = new Set<string>()
    for (const item of rawList) {
      const instrument = normalizeStoredInstrument(item, now)
      if (!instrument || seen.has(instrument.symbolId)) continue
      seen.add(instrument.symbolId)
      normalized.push(instrument)
    }

    if (normalized.length === 0) {
      cache = seedInstruments(now)
      await persist(cache)
      return cache
    }

    cache = normalized
    return cache
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code && code !== 'ENOENT') {
      logger.error('Failed to read monitored-instrument configuration; reseeding.', error)
    }
    cache = seedInstruments(now)
    await persist(cache)
    return cache
  }
}

export async function listMonitoredInstruments(): Promise<MonitoredInstrument[]> {
  const instruments = await load()
  return instruments.map((instrument) => ({ ...instrument }))
}

export async function getMonitoredInstrument(symbolId: string): Promise<MonitoredInstrument | null> {
  const instruments = await load()
  const found = instruments.find((instrument) => instrument.symbolId === symbolId)
  return found ? { ...found } : null
}

export async function addMonitoredInstrument(input: MonitoredInstrumentInput): Promise<MonitoredInstrument> {
  const instruments = await load()
  const now = new Date().toISOString()
  const instrument = buildMonitoredInstrument(input, now)

  if (instruments.some((existing) => existing.symbolId === instrument.symbolId)) {
    throw new MonitoredInstrumentValidationError(
      `Instrument with symbolId ${instrument.symbolId} is already monitored.`,
      409,
    )
  }

  const next = [...instruments, instrument]
  await persist(next)
  cache = next
  return { ...instrument }
}

export async function updateMonitoredInstrument(
  symbolId: string,
  patch: MonitoredInstrumentPatch,
): Promise<MonitoredInstrument> {
  const instruments = await load()
  const index = instruments.findIndex((instrument) => instrument.symbolId === symbolId)
  if (index === -1) {
    throw new MonitoredInstrumentValidationError(`No monitored instrument with symbolId ${symbolId}.`, 404)
  }

  const now = new Date().toISOString()
  const updated = applyMonitoredInstrumentPatch(instruments[index]!, patch, now)
  const next = instruments.slice()
  next[index] = updated
  await persist(next)
  cache = next
  return { ...updated }
}

export async function removeMonitoredInstrument(symbolId: string): Promise<void> {
  const instruments = await load()
  const target = instruments.find((instrument) => instrument.symbolId === symbolId)
  if (!target) {
    throw new MonitoredInstrumentValidationError(`No monitored instrument with symbolId ${symbolId}.`, 404)
  }
  // XAUUSD is the protected anchor instrument across the app; it can be
  // disabled but not removed from the monitored registry.
  if (target.symbolName.toUpperCase() === 'XAUUSD') {
    throw new MonitoredInstrumentValidationError('XAUUSD is a protected instrument and cannot be removed.', 400)
  }

  const next = instruments.filter((instrument) => instrument.symbolId !== symbolId)
  await persist(next)
  cache = next
}

/** Test-only hook to reset the in-memory cache. */
export function __resetMonitoredInstrumentCache() {
  cache = null
}

export { DATA_FILE as MONITORED_INSTRUMENTS_FILE }
