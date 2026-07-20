import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { connect, type TLSSocket } from 'node:tls'
import protobuf, { type Type } from 'protobufjs'
import { environment } from '../config/environment.js'
import {
  cTraderPayloadType,
  cTraderProtocol,
} from '../protocol/ctraderAccountDiscoveryProtocol.js'
import { getCTraderAccessToken } from './ctraderService.js'

const CTRADER_PROTOBUF_PORT = 5035
const MAX_FRAME_LENGTH = 4 * 1024 * 1024
const PRICE_SCALE = 100_000
const XAUUSD_SYMBOL_ID = '41'
const XAUUSD_SYMBOL_NAME = 'XAUUSD'
const RECONNECT_BASE_MS = 2_000
const RECONNECT_MAX_MS = 30_000

export interface LiveSpotSnapshot {
  symbolId: string
  symbolName: string
  bid: number | null
  ask: number | null
  mid: number | null
  spread: number | null
  digits: number
  timestamp: string | null
  source: 'ctrader_live'
  connected: boolean
  subscribed: boolean
  status: 'disconnected' | 'connecting' | 'live' | 'error'
  error: string | null
}

type SpotListener = (snapshot: LiveSpotSnapshot) => void

interface ProtobufLong {
  low: number
  high: number
  unsigned: boolean
}

const spotEvents = new EventEmitter()
spotEvents.setMaxListeners(100)

let socket: TLSSocket | null = null
let incoming = Buffer.alloc(0)
let reconnectAttempt = 0
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let starting = false
let digits = 2
let latestSnapshot: LiveSpotSnapshot = createDisconnectedSnapshot()

function createDisconnectedSnapshot(error: string | null = null): LiveSpotSnapshot {
  return {
    symbolId: XAUUSD_SYMBOL_ID,
    symbolName: XAUUSD_SYMBOL_NAME,
    bid: null,
    ask: null,
    mid: null,
    spread: null,
    digits,
    timestamp: null,
    source: 'ctrader_live',
    connected: false,
    subscribed: false,
    status: error ? 'error' : 'disconnected',
    error,
  }
}

function getHost() {
  const cTraderEnvironment = environment.cTraderEnvironment.trim().toLowerCase()
  if (cTraderEnvironment === 'live') return 'live.ctraderapi.com'
  if (cTraderEnvironment === 'demo') return 'demo.ctraderapi.com'
  throw new Error('Invalid cTrader environment configuration.')
}

function getConfiguredAccountId() {
  const accountId = environment.cTraderAccountId.trim()
  if (!accountId || !/^\d+$/.test(accountId) || accountId === '0') {
    throw new Error('Missing or invalid CTRADER_ACCOUNT_ID configuration.')
  }
  const longConstructor = protobuf.util.Long as unknown as {
    fromString: (value: string, unsigned?: boolean) => ProtobufLong
  }
  return longConstructor.fromString(accountId, false)
}

function toNumber(value: string | number | undefined) {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : NaN
  }
  return NaN
}

function roundToDigits(value: number, precision: number) {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

function encodeFrame(payloadType: number, payload: Uint8Array, clientMsgId: string) {
  const envelope = cTraderProtocol.message.create({ payloadType, payload, clientMsgId })
  const body = Buffer.from(cTraderProtocol.message.encode(envelope).finish())
  const frame = Buffer.allocUnsafe(body.length + 4)
  frame.writeUInt32BE(body.length, 0)
  body.copy(frame, 4)
  return frame
}

function sendMessage(
  activeSocket: TLSSocket,
  payloadType: number,
  type: Type,
  value: Record<string, unknown>,
) {
  const verificationError = type.verify(value)
  if (verificationError) throw new Error(`Invalid cTrader protocol message: ${verificationError}`)
  const payload = type.encode(type.create(value)).finish()
  activeSocket.write(encodeFrame(payloadType, payload, randomUUID()))
}

function publish(snapshot: LiveSpotSnapshot) {
  latestSnapshot = snapshot
  spotEvents.emit('snapshot', snapshot)
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}

function destroySocket(sendUnsubscribe = false) {
  if (!socket) return
  const current = socket
  if (sendUnsubscribe) {
    try {
      const longConstructor = protobuf.util.Long as unknown as {
        fromString: (value: string, unsigned?: boolean) => ProtobufLong
      }
      sendMessage(current, cTraderPayloadType.unsubscribeSpotsRequest, cTraderProtocol.unsubscribeSpotsRequest, {
        ctidTraderAccountId: getConfiguredAccountId(),
        symbolId: [longConstructor.fromString(XAUUSD_SYMBOL_ID, false)],
      })
    } catch {
      // Best-effort unsubscribe before teardown.
    }
  }
  socket = null
  current.removeAllListeners()
  current.destroy()
}

function scheduleReconnect(reason: string) {
  if (!getCTraderAccessToken()) {
    publish(createDisconnectedSnapshot(reason))
    return
  }
  clearReconnectTimer()
  const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * (2 ** reconnectAttempt))
  reconnectAttempt += 1
  publish({
    ...latestSnapshot,
    connected: false,
    subscribed: false,
    status: 'connecting',
    error: reason,
  })
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    void ensureCTraderSpotStream()
  }, delay)
}

function handleSpotEvent(payload: Uint8Array) {
  const decoded = cTraderProtocol.spotEvent.decode(payload)
  const spot = cTraderProtocol.spotEvent.toObject(decoded, {
    longs: String,
    defaults: false,
  }) as {
    symbolId?: string
    bid?: string | number
    ask?: string | number
    timestamp?: string | number
  }

  if (String(spot.symbolId ?? '') !== XAUUSD_SYMBOL_ID) return

  const bidRaw = toNumber(spot.bid)
  const askRaw = toNumber(spot.ask)
  const bid = Number.isFinite(bidRaw) ? roundToDigits(bidRaw / PRICE_SCALE, digits) : null
  const ask = Number.isFinite(askRaw) ? roundToDigits(askRaw / PRICE_SCALE, digits) : null
  if (bid == null && ask == null) return

  const resolvedBid = bid ?? ask
  const resolvedAsk = ask ?? bid
  if (resolvedBid == null || resolvedAsk == null) return

  const mid = roundToDigits((resolvedBid + resolvedAsk) / 2, digits)
  const spread = roundToDigits(resolvedAsk - resolvedBid, Math.max(digits, 2))
  const timestampMs = toNumber(spot.timestamp)
  const timestamp = Number.isFinite(timestampMs) && timestampMs > 0
    ? new Date(timestampMs).toISOString()
    : new Date().toISOString()

  reconnectAttempt = 0
  publish({
    symbolId: XAUUSD_SYMBOL_ID,
    symbolName: XAUUSD_SYMBOL_NAME,
    bid: resolvedBid,
    ask: resolvedAsk,
    mid,
    spread,
    digits,
    timestamp,
    source: 'ctrader_live',
    connected: true,
    subscribed: true,
    status: 'live',
    error: null,
  })
}

function handleEnvelope(activeSocket: TLSSocket, payloadType: number, payload: Uint8Array) {
  if (payloadType === cTraderPayloadType.heartbeat) {
    sendMessage(activeSocket, cTraderPayloadType.heartbeat, cTraderProtocol.heartbeat, {})
    return
  }

  if (payloadType === cTraderPayloadType.commonError || payloadType === cTraderPayloadType.openApiError) {
    const type = payloadType === cTraderPayloadType.commonError
      ? cTraderProtocol.commonError
      : cTraderProtocol.openApiError
    const error = type.toObject(type.decode(payload), { defaults: false }) as {
      description?: string
      errorCode?: string
    }
    throw new Error(error.description || error.errorCode || 'cTrader Open API rejected the spot stream.')
  }

  if (payloadType === cTraderPayloadType.applicationAuthResponse) {
    cTraderProtocol.applicationAuthResponse.decode(payload)
    const accessToken = getCTraderAccessToken()
    if (!accessToken) throw new Error('cTrader is not connected.')
    sendMessage(activeSocket, cTraderPayloadType.accountAuthRequest, cTraderProtocol.accountAuthRequest, {
      ctidTraderAccountId: getConfiguredAccountId(),
      accessToken,
    })
    return
  }

  if (payloadType === cTraderPayloadType.accountAuthResponse) {
    cTraderProtocol.accountAuthResponse.decode(payload)
    const longConstructor = protobuf.util.Long as unknown as {
      fromString: (value: string, unsigned?: boolean) => ProtobufLong
    }
    sendMessage(activeSocket, cTraderPayloadType.symbolByIdRequest, cTraderProtocol.symbolByIdRequest, {
      ctidTraderAccountId: getConfiguredAccountId(),
      symbolId: [longConstructor.fromString(XAUUSD_SYMBOL_ID, false)],
    })
    return
  }

  if (payloadType === cTraderPayloadType.symbolByIdResponse) {
    const decoded = cTraderProtocol.symbolByIdResponse.decode(payload)
    const body = cTraderProtocol.symbolByIdResponse.toObject(decoded, {
      longs: String,
      defaults: false,
    }) as { symbol?: Array<{ symbolId?: string; digits?: number }> }
    const symbol = (body.symbol ?? []).find((item) => String(item.symbolId ?? '') === XAUUSD_SYMBOL_ID)
    if (symbol && Number.isInteger(symbol.digits) && (symbol.digits as number) >= 0) {
      digits = symbol.digits as number
    }
    const longConstructor = protobuf.util.Long as unknown as {
      fromString: (value: string, unsigned?: boolean) => ProtobufLong
    }
    sendMessage(activeSocket, cTraderPayloadType.subscribeSpotsRequest, cTraderProtocol.subscribeSpotsRequest, {
      ctidTraderAccountId: getConfiguredAccountId(),
      symbolId: [longConstructor.fromString(XAUUSD_SYMBOL_ID, false)],
      subscribeToSpotTimestamp: true,
    })
    return
  }

  if (payloadType === cTraderPayloadType.subscribeSpotsResponse) {
    cTraderProtocol.subscribeSpotsResponse.decode(payload)
    publish({
      ...latestSnapshot,
      digits,
      connected: true,
      subscribed: true,
      status: latestSnapshot.mid != null ? 'live' : 'connecting',
      error: null,
    })
    return
  }

  if (payloadType === cTraderPayloadType.spotEvent) {
    handleSpotEvent(payload)
  }
}

function openSocket() {
  const accessToken = getCTraderAccessToken()
  if (!accessToken) {
    publish(createDisconnectedSnapshot('cTrader is not connected.'))
    starting = false
    return
  }

  const clientId = environment.cTraderClientId.trim()
  const clientSecret = environment.cTraderClientSecret.trim()
  if (!clientId || !clientSecret) {
    publish(createDisconnectedSnapshot('Missing cTrader application credentials.'))
    starting = false
    return
  }

  let host: string
  try {
    host = getHost()
    getConfiguredAccountId()
  } catch (error) {
    publish(createDisconnectedSnapshot(error instanceof Error ? error.message : 'Invalid cTrader configuration.'))
    starting = false
    return
  }

  destroySocket()
  incoming = Buffer.alloc(0)
  publish({
    ...createDisconnectedSnapshot(),
    status: 'connecting',
    connected: false,
  })

  const nextSocket = connect({
    host,
    port: CTRADER_PROTOBUF_PORT,
    servername: host,
    rejectUnauthorized: true,
  })
  socket = nextSocket

  nextSocket.setTimeout(0)

  nextSocket.once('secureConnect', () => {
    starting = false
    try {
      sendMessage(nextSocket, cTraderPayloadType.applicationAuthRequest, cTraderProtocol.applicationAuthRequest, {
        clientId,
        clientSecret,
      })
    } catch (error) {
      destroySocket()
      scheduleReconnect(error instanceof Error ? error.message : 'Failed to authenticate cTrader application.')
    }
  })

  nextSocket.on('data', (chunk) => {
    if (socket !== nextSocket) return
    incoming = Buffer.concat([incoming, chunk])

    while (incoming.length >= 4) {
      const frameLength = incoming.readUInt32BE(0)
      if (frameLength <= 0 || frameLength > MAX_FRAME_LENGTH) {
        destroySocket()
        scheduleReconnect('Received an invalid frame from cTrader Open API.')
        return
      }
      if (incoming.length < frameLength + 4) return

      const frame = incoming.subarray(4, frameLength + 4)
      incoming = incoming.subarray(frameLength + 4)

      try {
        const decoded = cTraderProtocol.message.decode(frame) as unknown as {
          payloadType: number
          payload?: Uint8Array
        }
        handleEnvelope(nextSocket, decoded.payloadType, decoded.payload ?? new Uint8Array())
      } catch (error) {
        destroySocket()
        scheduleReconnect(error instanceof Error ? error.message : 'Failed to decode cTrader spot stream.')
        return
      }
    }
  })

  nextSocket.once('error', () => {
    if (socket !== nextSocket) return
    destroySocket()
    scheduleReconnect('Unable to connect to cTrader Open API spot stream.')
  })

  nextSocket.once('close', () => {
    if (socket !== nextSocket && socket !== null) return
    socket = null
    starting = false
    if (getCTraderAccessToken()) {
      scheduleReconnect('cTrader Open API closed the spot stream.')
    } else {
      publish(createDisconnectedSnapshot())
    }
  })
}

export function getLatestLiveSpotSnapshot() {
  return latestSnapshot
}

export function subscribeToLiveSpotSnapshots(listener: SpotListener) {
  spotEvents.on('snapshot', listener)
  return () => {
    spotEvents.off('snapshot', listener)
  }
}

export function ensureCTraderSpotStream() {
  if (socket || starting) return
  if (!getCTraderAccessToken()) {
    publish(createDisconnectedSnapshot('cTrader is not connected.'))
    return
  }
  starting = true
  clearReconnectTimer()
  openSocket()
}

export function stopCTraderSpotStream(reason = 'Spot stream stopped.') {
  clearReconnectTimer()
  starting = false
  destroySocket(true)
  publish(createDisconnectedSnapshot(reason === 'Spot stream stopped.' ? null : reason))
}

export function restartCTraderSpotStream() {
  stopCTraderSpotStream()
  ensureCTraderSpotStream()
}
