import { randomUUID } from 'node:crypto'
import { connect, type TLSSocket } from 'node:tls'
import protobuf, { type Type } from 'protobufjs'
import { environment } from '../config/environment.js'
import {
  cTraderPayloadType,
  cTraderProtocol,
  cTraderTrendbarPeriod,
  type CTraderHistoryTimeframe,
} from '../protocol/ctraderAccountDiscoveryProtocol.js'
import {
  CTraderOAuthError,
  getCTraderAccessToken,
} from './ctraderService.js'

const CTRADER_PROTOBUF_PORT = 5035
const CONNECTION_TIMEOUT_MS = 10_000
const MAX_FRAME_LENGTH = 4 * 1024 * 1024

export interface CTraderAccount {
  ctidTraderAccountId: string
  isLive: boolean
  traderLogin: string | null
  brokerTitleShort: string | null
}

export interface CTraderSymbol {
  symbolId: string
  symbolName: string
  enabled: boolean
}

export interface CTraderSymbolDiscovery {
  symbols: CTraderSymbol[]
  goldMatches: CTraderSymbol[]
}

export interface CTraderCandle {
  time: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export const CTRADER_HISTORY_MAX_COUNT = 5000

export const CTRADER_HISTORY_DEFAULT_COUNT: Record<CTraderHistoryTimeframe, number> = {
  D1: 300,
  H4: 1500,
  H1: 2000,
  M15: 2000,
  M5: 2000,
}

interface AccountListPayload {
  ctidTraderAccount?: Array<{
    ctidTraderAccountId?: string
    isLive?: boolean
    traderLogin?: string
    brokerTitleShort?: string
  }>
}

interface SymbolListPayload {
  symbol?: Array<{
    symbolId?: string
    symbolName?: string
    enabled?: boolean
  }>
}

interface TrendbarsPayload {
  trendbar?: Array<{
    volume?: string | number
    low?: string | number
    deltaOpen?: string | number
    deltaClose?: string | number
    deltaHigh?: string | number
    utcTimestampInMinutes?: number
  }>
}

const PRICE_SCALE = 100_000

interface ErrorPayload {
  errorCode?: string
  description?: string
}

interface ProtocolEnvelope {
  payloadType: number
  payload: Uint8Array
}

interface ProtobufLong {
  low: number
  high: number
  unsigned: boolean
}

type ProtocolResult<T> =
  | { done: false }
  | { done: true; value: T }

function getHost() {
  const cTraderEnvironment = environment.cTraderEnvironment.trim().toLowerCase()
  if (cTraderEnvironment === 'live') return 'live.ctraderapi.com'
  if (cTraderEnvironment === 'demo') return 'demo.ctraderapi.com'
  throw new CTraderOAuthError('Invalid cTrader environment configuration.', 500)
}

function getApplicationCredentials() {
  const clientId = environment.cTraderClientId.trim()
  const clientSecret = environment.cTraderClientSecret.trim()
  if (!clientId || !clientSecret) {
    throw new CTraderOAuthError('Missing cTrader environment configuration.', 500)
  }
  return { clientId, clientSecret }
}

function getRequiredAccessToken() {
  const accessToken = getCTraderAccessToken()
  if (!accessToken) throw new CTraderOAuthError('cTrader is not connected.', 401)
  return accessToken
}

function getConfiguredAccountId() {
  const accountId = environment.cTraderAccountId.trim()
  if (!accountId) throw new CTraderOAuthError('Missing CTRADER_ACCOUNT_ID configuration.', 500)
  if (!/^\d+$/.test(accountId) || accountId === '0') {
    throw new CTraderOAuthError('Invalid CTRADER_ACCOUNT_ID configuration.', 500)
  }
  const longConstructor = protobuf.util.Long as unknown as {
    fromString: (value: string, unsigned?: boolean) => ProtobufLong
  }
  return longConstructor.fromString(accountId, false)
}

function toNumber(value: string | number | undefined, fallback = 0) {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }
  return fallback
}

function mapTrendbarToCandle(trendbar: NonNullable<TrendbarsPayload['trendbar']>[number]): CTraderCandle {
  const lowRaw = toNumber(trendbar.low)
  const openRaw = lowRaw + toNumber(trendbar.deltaOpen)
  const closeRaw = lowRaw + toNumber(trendbar.deltaClose)
  const highRaw = lowRaw + toNumber(trendbar.deltaHigh)
  const timestampMinutes = trendbar.utcTimestampInMinutes ?? 0

  return {
    time: new Date(timestampMinutes * 60_000).toISOString(),
    open: openRaw / PRICE_SCALE,
    high: highRaw / PRICE_SCALE,
    low: lowRaw / PRICE_SCALE,
    close: closeRaw / PRICE_SCALE,
    volume: toNumber(trendbar.volume),
  }
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
  socket: TLSSocket,
  payloadType: number,
  type: Type,
  value: Record<string, unknown>,
) {
  const verificationError = type.verify(value)
  if (verificationError) throw new CTraderOAuthError(`Invalid cTrader protocol message: ${verificationError}`, 502)
  const payload = type.encode(type.create(value)).finish()
  socket.write(encodeFrame(payloadType, payload, randomUUID()))
}

function decodeError(payloadType: number, payload: Uint8Array) {
  const type = payloadType === cTraderPayloadType.commonError
    ? cTraderProtocol.commonError
    : cTraderProtocol.openApiError
  return type.toObject(type.decode(payload), { defaults: false }) as ErrorPayload
}

function connectToCTrader<T>(
  onConnected: (socket: TLSSocket) => void,
  onMessage: (socket: TLSSocket, envelope: ProtocolEnvelope) => ProtocolResult<T>,
) {
  const host = getHost()

  return new Promise<T>((resolve, reject) => {
    let settled = false
    let incoming = Buffer.alloc(0)
    const socket = connect({
      host,
      port: CTRADER_PROTOBUF_PORT,
      servername: host,
      rejectUnauthorized: true,
    })

    const finish = (error?: CTraderOAuthError, value?: T) => {
      if (settled) return
      settled = true
      socket.destroy()
      if (error) reject(error)
      else resolve(value as T)
    }

    socket.setTimeout(CONNECTION_TIMEOUT_MS, () => {
      finish(new CTraderOAuthError('Timed out while connecting to cTrader Open API.', 502))
    })

    socket.once('secureConnect', () => {
      try {
        onConnected(socket)
      } catch (error) {
        finish(error instanceof CTraderOAuthError
          ? error
          : new CTraderOAuthError('Failed to create the cTrader application authentication request.', 502))
      }
    })

    socket.on('data', (chunk) => {
      if (settled) return
      incoming = Buffer.concat([incoming, chunk])

      while (incoming.length >= 4) {
        const frameLength = incoming.readUInt32BE(0)
        if (frameLength <= 0 || frameLength > MAX_FRAME_LENGTH) {
          finish(new CTraderOAuthError('Received an invalid frame from cTrader Open API.', 502))
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
          const envelope = {
            payloadType: decoded.payloadType,
            payload: decoded.payload ?? new Uint8Array(),
          }

          if (envelope.payloadType === cTraderPayloadType.commonError ||
            envelope.payloadType === cTraderPayloadType.openApiError) {
            const error = decodeError(envelope.payloadType, envelope.payload)
            finish(new CTraderOAuthError(
              error.description || error.errorCode || 'cTrader Open API rejected the request.',
              502,
            ))
            return
          }

          const result = onMessage(socket, envelope)
          if (result.done) {
            finish(undefined, result.value)
            return
          }
        } catch (error) {
          finish(error instanceof CTraderOAuthError
            ? error
            : new CTraderOAuthError('Failed to decode the cTrader Open API response.', 502))
          return
        }
      }
    })

    socket.once('error', () => {
      finish(new CTraderOAuthError('Unable to connect to cTrader Open API.', 502))
    })

    socket.once('close', () => {
      if (!settled) finish(new CTraderOAuthError('cTrader Open API closed the connection.', 502))
    })
  })
}

function sendApplicationAuthentication(socket: TLSSocket, clientId: string, clientSecret: string) {
  sendMessage(
    socket,
    cTraderPayloadType.applicationAuthRequest,
    cTraderProtocol.applicationAuthRequest,
    { clientId, clientSecret },
  )
}

export async function getAuthorizedCTraderAccounts(): Promise<CTraderAccount[]> {
  const accessToken = getRequiredAccessToken()
  const { clientId, clientSecret } = getApplicationCredentials()

  return connectToCTrader<CTraderAccount[]>(
    (socket) => sendApplicationAuthentication(socket, clientId, clientSecret),
    (socket, envelope) => {
      if (envelope.payloadType === cTraderPayloadType.applicationAuthResponse) {
        cTraderProtocol.applicationAuthResponse.decode(envelope.payload)
        sendMessage(
          socket,
          cTraderPayloadType.accountListRequest,
          cTraderProtocol.accountListRequest,
          { accessToken },
        )
        return { done: false }
      }

      if (envelope.payloadType === cTraderPayloadType.accountListResponse) {
        const decoded = cTraderProtocol.accountListResponse.decode(envelope.payload)
        const accountList = cTraderProtocol.accountListResponse.toObject(decoded, {
          longs: String,
          enums: String,
          defaults: false,
        }) as AccountListPayload
        return {
          done: true,
          value: (accountList.ctidTraderAccount ?? []).map((account) => ({
            ctidTraderAccountId: account.ctidTraderAccountId ?? '',
            isLive: account.isLive ?? false,
            traderLogin: account.traderLogin ?? null,
            brokerTitleShort: account.brokerTitleShort ?? null,
          })),
        }
      }

      return { done: false }
    },
  )
}

export async function getConfiguredCTraderSymbols(): Promise<CTraderSymbolDiscovery> {
  const accessToken = getRequiredAccessToken()
  const ctidTraderAccountId = getConfiguredAccountId()
  const { clientId, clientSecret } = getApplicationCredentials()

  return connectToCTrader<CTraderSymbolDiscovery>(
    (socket) => sendApplicationAuthentication(socket, clientId, clientSecret),
    (socket, envelope) => {
      if (envelope.payloadType === cTraderPayloadType.applicationAuthResponse) {
        cTraderProtocol.applicationAuthResponse.decode(envelope.payload)
        sendMessage(
          socket,
          cTraderPayloadType.accountAuthRequest,
          cTraderProtocol.accountAuthRequest,
          { ctidTraderAccountId, accessToken },
        )
        return { done: false }
      }

      if (envelope.payloadType === cTraderPayloadType.accountAuthResponse) {
        cTraderProtocol.accountAuthResponse.decode(envelope.payload)
        sendMessage(
          socket,
          cTraderPayloadType.symbolsListRequest,
          cTraderProtocol.symbolsListRequest,
          { ctidTraderAccountId },
        )
        return { done: false }
      }

      if (envelope.payloadType === cTraderPayloadType.symbolsListResponse) {
        const decoded = cTraderProtocol.symbolsListResponse.decode(envelope.payload)
        const symbolList = cTraderProtocol.symbolsListResponse.toObject(decoded, {
          longs: String,
          defaults: false,
        }) as SymbolListPayload
        const symbols = (symbolList.symbol ?? []).map((symbol) => ({
          symbolId: symbol.symbolId ?? '',
          symbolName: symbol.symbolName ?? '',
          enabled: symbol.enabled ?? false,
        }))
        const goldMatches = symbols.filter((symbol) => {
          const name = symbol.symbolName.toUpperCase()
          return name.includes('XAU') || name.includes('GOLD')
        })
        return {
          done: true,
          value: { symbols, goldMatches },
        }
      }

      return { done: false }
    },
  )
}

export async function getConfiguredCTraderHistory(params: {
  symbolId: string
  timeframe: CTraderHistoryTimeframe
  count: number
}): Promise<CTraderCandle[]> {
  const accessToken = getRequiredAccessToken()
  const ctidTraderAccountId = getConfiguredAccountId()
  const { clientId, clientSecret } = getApplicationCredentials()
  const longConstructor = protobuf.util.Long as unknown as {
    fromString: (value: string, unsigned?: boolean) => ProtobufLong
  }
  const symbolId = longConstructor.fromString(params.symbolId, false)
  const period = cTraderTrendbarPeriod[params.timeframe]
  const toTimestamp = Date.now()

  return connectToCTrader<CTraderCandle[]>(
    (socket) => sendApplicationAuthentication(socket, clientId, clientSecret),
    (socket, envelope) => {
      if (envelope.payloadType === cTraderPayloadType.applicationAuthResponse) {
        cTraderProtocol.applicationAuthResponse.decode(envelope.payload)
        sendMessage(
          socket,
          cTraderPayloadType.accountAuthRequest,
          cTraderProtocol.accountAuthRequest,
          { ctidTraderAccountId, accessToken },
        )
        return { done: false }
      }

      if (envelope.payloadType === cTraderPayloadType.accountAuthResponse) {
        cTraderProtocol.accountAuthResponse.decode(envelope.payload)
        sendMessage(
          socket,
          cTraderPayloadType.getTrendbarsRequest,
          cTraderProtocol.getTrendbarsRequest,
          {
            ctidTraderAccountId,
            toTimestamp,
            period,
            symbolId,
            count: params.count,
          },
        )
        return { done: false }
      }

      if (envelope.payloadType === cTraderPayloadType.getTrendbarsResponse) {
        const decoded = cTraderProtocol.getTrendbarsResponse.decode(envelope.payload)
        const trendbars = cTraderProtocol.getTrendbarsResponse.toObject(decoded, {
          longs: String,
          defaults: false,
        }) as TrendbarsPayload
        const candles = (trendbars.trendbar ?? [])
          .map(mapTrendbarToCandle)
          .sort((a, b) => a.time.localeCompare(b.time))
        return { done: true, value: candles }
      }

      return { done: false }
    },
  )
}
