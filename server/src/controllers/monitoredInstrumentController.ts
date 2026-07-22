import type { Request, Response } from 'express'
import { getConfiguredCTraderSymbols } from '../services/ctraderAccountService.js'
import { CTraderOAuthError } from '../services/ctraderService.js'
import {
  MonitoredInstrumentValidationError,
  sanitizeSymbolId,
} from '../services/monitoredInstrumentRules.js'
import {
  addMonitoredInstrument,
  getMonitoredInstrument,
  listMonitoredInstruments,
  removeMonitoredInstrument,
  updateMonitoredInstrument,
} from '../services/monitoredInstrumentStore.js'
import { listOpeningProfiles } from '../services/openingProfile/openingProfileStore.js'

async function assertOpeningProfilesExist(openingProfileIds: unknown): Promise<void> {
  if (openingProfileIds === undefined || openingProfileIds === null) return
  if (!Array.isArray(openingProfileIds)) {
    throw new MonitoredInstrumentValidationError('openingProfileIds must be an array of profile ids.')
  }
  const profiles = await listOpeningProfiles()
  const known = new Set(profiles.map((profile) => profile.id))
  for (const id of openingProfileIds) {
    if (typeof id === 'string' && id.trim() && !known.has(id.trim())) {
      throw new MonitoredInstrumentValidationError(`Unknown Opening Profile id: ${id}.`, 422)
    }
  }
}

function sendError(response: Response, error: unknown) {
  if (error instanceof MonitoredInstrumentValidationError) {
    response.status(error.statusCode).json({ success: false, error: error.message })
    return
  }
  if (error instanceof CTraderOAuthError) {
    response.status(error.statusCode).json({ success: false, error: error.message })
    return
  }
  const message = error instanceof Error ? error.message : 'Failed to process monitored instrument request.'
  response.status(500).json({ success: false, error: message })
}

/**
 * Confirm the symbol exists in the authenticated cTrader catalogue and return
 * its canonical name. Requires an active cTrader connection.
 */
async function assertSymbolInCatalogue(symbolId: string, symbolName: string): Promise<string> {
  const discovery = await getConfiguredCTraderSymbols()
  const match = discovery.symbols.find((symbol) => symbol.symbolId === symbolId)
  if (!match) {
    throw new MonitoredInstrumentValidationError(
      `Symbol id ${symbolId} was not found in the authenticated cTrader catalogue.`,
      422,
    )
  }
  if (match.symbolName.trim().toUpperCase() !== symbolName) {
    throw new MonitoredInstrumentValidationError(
      `Symbol id ${symbolId} maps to ${match.symbolName} in cTrader, not ${symbolName}.`,
      422,
    )
  }
  return match.symbolName.trim().toUpperCase()
}

export async function listMonitoredInstrumentsController(_request: Request, response: Response) {
  try {
    const instruments = await listMonitoredInstruments()
    response.json({ success: true, instruments })
  } catch (error) {
    sendError(response, error)
  }
}

export async function createMonitoredInstrumentController(request: Request, response: Response) {
  try {
    const body = (request.body ?? {}) as Record<string, unknown>
    const symbolId = sanitizeSymbolId(body.symbolId)
    const symbolName = typeof body.symbolName === 'string' ? body.symbolName.trim().toUpperCase() : ''
    if (!symbolName) {
      throw new MonitoredInstrumentValidationError('symbolName is required.')
    }

    await assertSymbolInCatalogue(symbolId, symbolName)
    await assertOpeningProfilesExist(body.openingProfileIds)

    const instrument = await addMonitoredInstrument({ ...body, symbolId, symbolName })
    response.status(201).json({ success: true, instrument })
  } catch (error) {
    sendError(response, error)
  }
}

export async function updateMonitoredInstrumentController(request: Request, response: Response) {
  try {
    const symbolId = sanitizeSymbolId(request.params.symbolId)
    const existing = await getMonitoredInstrument(symbolId)
    if (!existing) {
      throw new MonitoredInstrumentValidationError(`No monitored instrument with symbolId ${symbolId}.`, 404)
    }
    const body = (request.body ?? {}) as Record<string, unknown>
    await assertOpeningProfilesExist(body.openingProfileIds)
    const instrument = await updateMonitoredInstrument(symbolId, body)
    response.json({ success: true, instrument })
  } catch (error) {
    sendError(response, error)
  }
}

export async function deleteMonitoredInstrumentController(request: Request, response: Response) {
  try {
    const symbolId = sanitizeSymbolId(request.params.symbolId)
    await removeMonitoredInstrument(symbolId)
    response.json({ success: true })
  } catch (error) {
    sendError(response, error)
  }
}
