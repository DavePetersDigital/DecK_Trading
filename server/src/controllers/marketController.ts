import type { Request, Response } from 'express'
import {
  ensureCTraderSpotStream,
  getLatestLiveSpotSnapshot,
  subscribeToLiveSpotSnapshots,
  type LiveSpotSnapshot,
} from '../services/ctraderSpotStreamService.js'
import { getCTraderAccessToken } from '../services/ctraderService.js'

const HEARTBEAT_MS = 15_000
const XAUUSD_SYMBOL_ID = '41'

function writeEvent(response: Response, event: string, data: unknown) {
  response.write(`event: ${event}\n`)
  response.write(`data: ${JSON.stringify(data)}\n\n`)
}

function toStreamPayload(snapshot: LiveSpotSnapshot) {
  return {
    type: 'snapshot',
    symbolId: snapshot.symbolId,
    symbolName: snapshot.symbolName,
    bid: snapshot.bid,
    ask: snapshot.ask,
    mid: snapshot.mid,
    spread: snapshot.spread,
    digits: snapshot.digits,
    timestamp: snapshot.timestamp,
    source: snapshot.source,
    connected: snapshot.connected,
    subscribed: snapshot.subscribed,
    status: snapshot.status,
    error: snapshot.error,
  }
}

export function marketStreamController(request: Request, response: Response) {
  const symbolId = typeof request.query.symbolId === 'string' ? request.query.symbolId.trim() : XAUUSD_SYMBOL_ID
  if (symbolId !== XAUUSD_SYMBOL_ID) {
    response.status(400).json({
      success: false,
      error: 'Only symbolId=41 (XAUUSD) is supported for live market streaming.',
    })
    return
  }

  response.status(200)
  response.setHeader('Content-Type', 'text/event-stream')
  response.setHeader('Cache-Control', 'no-cache, no-transform')
  response.setHeader('Connection', 'keep-alive')
  response.setHeader('X-Accel-Buffering', 'no')
  response.flushHeaders?.()

  if (!getCTraderAccessToken()) {
    const snapshot = toStreamPayload(getLatestLiveSpotSnapshot())
    writeEvent(response, 'status', {
      ...snapshot,
      type: 'disconnected',
      status: 'disconnected',
      message: 'cTrader is not connected.',
      error: 'cTrader is not connected.',
      snapshot,
    })
  } else {
    ensureCTraderSpotStream()
    writeEvent(response, 'market', toStreamPayload(getLatestLiveSpotSnapshot()))
  }

  const unsubscribe = subscribeToLiveSpotSnapshots((snapshot) => {
    writeEvent(response, 'market', toStreamPayload(snapshot))
  })

  const heartbeat = setInterval(() => {
    writeEvent(response, 'heartbeat', {
      type: 'heartbeat',
      timestamp: new Date().toISOString(),
    })
  }, HEARTBEAT_MS)

  const cleanup = () => {
    clearInterval(heartbeat)
    unsubscribe()
  }

  request.on('close', cleanup)
  response.on('error', cleanup)
}
