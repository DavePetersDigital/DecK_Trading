import { randomUUID } from 'node:crypto'
import { connect, type TLSSocket } from 'node:tls'
import type { Type } from 'protobufjs'
import {
  cTraderPayloadType,
  cTraderProtocol,
} from '../protocol/ctraderAccountDiscoveryProtocol.js'
import { environment } from '../config/environment.js'
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

interface AccountListPayload {
  ctidTraderAccount?: Array<{
    ctidTraderAccountId?: string
    isLive?: boolean
    traderLogin?: string
    brokerTitleShort?: string
  }>
}

interface ErrorPayload {
  errorCode?: string
  description?: string
}

function getHost() {
  const cTraderEnvironment = environment.cTraderEnvironment.trim().toLowerCase()
  if (cTraderEnvironment === 'live') return 'live.ctraderapi.com'
  if (cTraderEnvironment === 'demo') return 'demo.ctraderapi.com'
  throw new CTraderOAuthError('Invalid cTrader environment configuration.', 500)
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
  if (verificationError) throw new CTraderOAuthError(`Invalid cTrader protocol message: ${verificationError}`, 500)
  const payload = type.encode(type.create(value)).finish()
  socket.write(encodeFrame(payloadType, payload, randomUUID()))
}

function decodeError(payloadType: number, payload: Uint8Array) {
  const type = payloadType === cTraderPayloadType.commonError
    ? cTraderProtocol.commonError
    : cTraderProtocol.openApiError
  return type.toObject(type.decode(payload), { defaults: false }) as ErrorPayload
}

export async function getAuthorizedCTraderAccounts(): Promise<CTraderAccount[]> {
  const accessToken = getCTraderAccessToken()
  if (!accessToken) throw new CTraderOAuthError('cTrader is not connected.', 401)

  const clientId = environment.cTraderClientId.trim()
  const clientSecret = environment.cTraderClientSecret.trim()
  if (!clientId || !clientSecret) {
    throw new CTraderOAuthError('Missing cTrader environment configuration.', 500)
  }

  const host = getHost()

  return new Promise<CTraderAccount[]>((resolve, reject) => {
    let settled = false
    let incoming = Buffer.alloc(0)
    const socket = connect({
      host,
      port: CTRADER_PROTOBUF_PORT,
      servername: host,
      rejectUnauthorized: true,
    })

    const finish = (error?: CTraderOAuthError, accounts?: CTraderAccount[]) => {
      if (settled) return
      settled = true
      socket.destroy()
      if (error) reject(error)
      else resolve(accounts ?? [])
    }

    socket.setTimeout(CONNECTION_TIMEOUT_MS, () => {
      finish(new CTraderOAuthError('Timed out while connecting to cTrader Open API.', 504))
    })

    socket.once('secureConnect', () => {
      try {
        sendMessage(
          socket,
          cTraderPayloadType.applicationAuthRequest,
          cTraderProtocol.applicationAuthRequest,
          { clientId, clientSecret },
        )
      } catch {
        finish(new CTraderOAuthError('Failed to create the cTrader application authentication request.', 500))
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
          const envelope = cTraderProtocol.message.decode(frame) as unknown as {
            payloadType: number
            payload?: Uint8Array
          }
          const payload = envelope.payload ?? new Uint8Array()

          if (envelope.payloadType === cTraderPayloadType.commonError ||
            envelope.payloadType === cTraderPayloadType.openApiError) {
            const error = decodeError(envelope.payloadType, payload)
            finish(new CTraderOAuthError(
              error.description || error.errorCode || 'cTrader Open API rejected the request.',
              502,
            ))
            return
          }

          if (envelope.payloadType === cTraderPayloadType.applicationAuthResponse) {
            cTraderProtocol.applicationAuthResponse.decode(payload)
            sendMessage(
              socket,
              cTraderPayloadType.accountListRequest,
              cTraderProtocol.accountListRequest,
              { accessToken },
            )
            continue
          }

          if (envelope.payloadType === cTraderPayloadType.accountListResponse) {
            const decoded = cTraderProtocol.accountListResponse.decode(payload)
            const accountList = cTraderProtocol.accountListResponse.toObject(decoded, {
              longs: String,
              enums: String,
              defaults: false,
            }) as AccountListPayload
            const accounts = (accountList.ctidTraderAccount ?? []).map((account) => ({
              ctidTraderAccountId: account.ctidTraderAccountId ?? '',
              isLive: account.isLive ?? false,
              traderLogin: account.traderLogin ?? null,
              brokerTitleShort: account.brokerTitleShort ?? null,
            }))
            finish(undefined, accounts)
            return
          }
        } catch {
          finish(new CTraderOAuthError('Failed to decode the cTrader Open API response.', 502))
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
