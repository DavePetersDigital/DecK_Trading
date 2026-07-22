import type { Request, Response } from 'express'
import { getOrbEngineState, listMarketEvents } from '../services/orb/orbEngine.js'

export function getOrbStateController(_request: Request, response: Response) {
  const state = getOrbEngineState()
  response.json({ success: true, ...state })
}

export function getOrbAlertsController(_request: Request, response: Response) {
  const { alerts } = getOrbEngineState()
  response.json({ success: true, alerts })
}

export function getMarketEventsController(request: Request, response: Response) {
  const query = request.query
  const limitRaw = typeof query.limit === 'string' ? Number(query.limit) : undefined
  const events = listMarketEvents({
    limit: Number.isFinite(limitRaw) ? limitRaw : undefined,
    instrumentId: typeof query.instrumentId === 'string' ? query.instrumentId : undefined,
    openingProfileId: typeof query.openingProfileId === 'string' ? query.openingProfileId : undefined,
    eventType: typeof query.eventType === 'string' ? query.eventType : undefined,
    timeframe: typeof query.timeframe === 'string' ? query.timeframe : undefined,
    from: typeof query.from === 'string' ? query.from : undefined,
    to: typeof query.to === 'string' ? query.to : undefined,
  })
  response.json({ success: true, events })
}
