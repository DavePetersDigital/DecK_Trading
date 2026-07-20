import { environment } from '../config/environment.js'
import { restartCTraderSpotStream } from './ctraderSpotStreamService.js'

const CTRADER_AUTHORIZATION_URL = 'https://id.ctrader.com/my/settings/openapi/grantingaccess/'
const CTRADER_TOKEN_URL = 'https://openapi.ctrader.com/apps/token'

interface CTraderTokenResponse {
  accessToken?: string
  errorCode?: string | null
  description?: string | null
}

export class CTraderOAuthError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message)
    this.name = 'CTraderOAuthError'
  }
}

let accessToken: string | null = null

export function buildCTraderAuthorizationUrl() {
  const clientId = environment.cTraderClientId.trim()
  const redirectUri = environment.cTraderRedirectUri.trim()
  const cTraderEnvironment = environment.cTraderEnvironment.trim()

  if (!clientId || !redirectUri || !cTraderEnvironment) return null

  // cTrader uses the same OAuth authorisation host for demo and live accounts.
  // The environment is still required here for the later API connection stage.
  const authorizationUrl = new URL(CTRADER_AUTHORIZATION_URL)
  authorizationUrl.searchParams.set('client_id', clientId)
  authorizationUrl.searchParams.set('redirect_uri', redirectUri)
  authorizationUrl.searchParams.set('scope', 'trading')
  authorizationUrl.searchParams.set('product', 'web')

  return authorizationUrl.toString()
}

export async function exchangeCTraderAuthorizationCode(code: string) {
  const clientId = environment.cTraderClientId.trim()
  const clientSecret = environment.cTraderClientSecret.trim()
  const redirectUri = environment.cTraderRedirectUri.trim()

  if (!clientId || !clientSecret || !redirectUri) {
    throw new CTraderOAuthError('Missing cTrader environment configuration.', 500)
  }

  const tokenUrl = new URL(CTRADER_TOKEN_URL)
  tokenUrl.searchParams.set('grant_type', 'authorization_code')
  tokenUrl.searchParams.set('code', code)
  tokenUrl.searchParams.set('redirect_uri', redirectUri)
  tokenUrl.searchParams.set('client_id', clientId)
  tokenUrl.searchParams.set('client_secret', clientSecret)

  let response: Response
  try {
    response = await fetch(tokenUrl, {
      headers: { Accept: 'application/json' },
    })
  } catch {
    throw new CTraderOAuthError('Unable to reach the cTrader token endpoint.', 502)
  }

  let payload: CTraderTokenResponse
  try {
    payload = await response.json() as CTraderTokenResponse
  } catch {
    throw new CTraderOAuthError('Invalid response from the cTrader token endpoint.', 502)
  }

  if (!response.ok || payload.errorCode || !payload.accessToken) {
    throw new CTraderOAuthError(
      payload.description || payload.errorCode || 'Failed to exchange cTrader authorization code.',
      502,
    )
  }

  accessToken = payload.accessToken
  restartCTraderSpotStream()
}

export function getCTraderAccessToken() {
  return accessToken
}
