import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { logger } from '../../utils/logger.js'
import {
  applyOpeningProfilePatch,
  buildOpeningProfile,
  normalizeStoredProfile,
  OpeningProfileValidationError,
  seedOpeningProfiles,
  type OpeningProfile,
  type OpeningProfileInput,
  type OpeningProfilePatch,
} from './openingProfileRules.js'

const projectRoot = fileURLToPath(new URL('../../../../', import.meta.url))
const DATA_DIR = join(projectRoot, 'data')
const DATA_FILE = join(DATA_DIR, 'opening-profiles.json')

const STORE_VERSION = 1

interface OpeningProfileFile {
  version: number
  profiles: OpeningProfile[]
}

let cache: OpeningProfile[] | null = null
let writeChain: Promise<void> = Promise.resolve()

async function persist(profiles: OpeningProfile[]): Promise<void> {
  const payload: OpeningProfileFile = { version: STORE_VERSION, profiles }
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

async function load(): Promise<OpeningProfile[]> {
  if (cache) return cache

  const now = new Date().toISOString()
  try {
    const raw = await readFile(DATA_FILE, 'utf8')
    const parsed = JSON.parse(raw) as Partial<OpeningProfileFile>
    const rawList = Array.isArray(parsed.profiles) ? parsed.profiles : []
    const normalized: OpeningProfile[] = []
    const seen = new Set<string>()
    for (const item of rawList) {
      const profile = normalizeStoredProfile(item, now)
      if (!profile || seen.has(profile.id)) continue
      seen.add(profile.id)
      normalized.push(profile)
    }

    if (normalized.length === 0) {
      cache = seedOpeningProfiles(now)
      await persist(cache)
      return cache
    }

    cache = normalized
    return cache
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code && code !== 'ENOENT') {
      logger.error('Failed to read opening-profile configuration; reseeding.', error)
    }
    cache = seedOpeningProfiles(now)
    await persist(cache)
    return cache
  }
}

export async function listOpeningProfiles(): Promise<OpeningProfile[]> {
  const profiles = await load()
  return profiles.map((profile) => ({ ...profile }))
}

export async function getOpeningProfile(id: string): Promise<OpeningProfile | null> {
  const profiles = await load()
  const found = profiles.find((profile) => profile.id === id)
  return found ? { ...found } : null
}

export async function addOpeningProfile(input: OpeningProfileInput): Promise<OpeningProfile> {
  const profiles = await load()
  const now = new Date().toISOString()
  const profile = buildOpeningProfile(input, now)
  if (profiles.some((existing) => existing.id === profile.id)) {
    throw new OpeningProfileValidationError(`Opening Profile with id ${profile.id} already exists.`, 409)
  }
  const next = [...profiles, profile]
  await persist(next)
  cache = next
  return { ...profile }
}

export async function updateOpeningProfile(id: string, patch: OpeningProfilePatch): Promise<OpeningProfile> {
  const profiles = await load()
  const index = profiles.findIndex((profile) => profile.id === id)
  if (index === -1) {
    throw new OpeningProfileValidationError(`No Opening Profile with id ${id}.`, 404)
  }
  const now = new Date().toISOString()
  const updated = applyOpeningProfilePatch(profiles[index]!, patch, now)
  const next = profiles.slice()
  next[index] = updated
  await persist(next)
  cache = next
  return { ...updated }
}

export async function removeOpeningProfile(id: string): Promise<void> {
  const profiles = await load()
  if (!profiles.some((profile) => profile.id === id)) {
    throw new OpeningProfileValidationError(`No Opening Profile with id ${id}.`, 404)
  }
  const next = profiles.filter((profile) => profile.id !== id)
  await persist(next)
  cache = next
}

/** Test-only hook to reset the in-memory cache. */
export function __resetOpeningProfileCache() {
  cache = null
}

export { DATA_FILE as OPENING_PROFILES_FILE }
