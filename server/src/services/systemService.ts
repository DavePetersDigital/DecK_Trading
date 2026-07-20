import { environment } from '../config/environment.js'
import { getCTraderAccessToken } from './ctraderService.js'

export const application = {
  name: 'DecK Trading Dashboard',
  version: '0.1.0',
} as const

export type IntegrationServiceStatus =
  | 'connected'
  | 'not_connected'
  | 'not_configured'
  | 'connection_expired'
  | 'error'

function isCTraderConfigured() {
  return Boolean(
    environment.cTraderClientId.trim() &&
    environment.cTraderClientSecret.trim() &&
    environment.cTraderRedirectUri.trim() &&
    environment.cTraderEnvironment.trim(),
  )
}

function isTelegramConfigured() {
  return Boolean(environment.telegramBotToken.trim() && environment.telegramChatId.trim())
}

function getCTraderServiceStatus() {
  const configured = isCTraderConfigured()
  const connected = Boolean(getCTraderAccessToken())
  const environmentName = environment.cTraderEnvironment.trim().toLowerCase()
  const accountId = environment.cTraderAccountId.trim()

  let status: IntegrationServiceStatus
  if (!configured) status = 'not_configured'
  else if (connected) status = 'connected'
  else status = 'not_connected'

  return {
    status,
    connected,
    configured,
    ...(environmentName ? { environment: environmentName } : {}),
    ...(accountId ? { accountId } : {}),
  }
}

function getTelegramServiceStatus() {
  const configured = isTelegramConfigured()
  return {
    status: 'not_connected' as const,
    connected: false,
    configured,
  }
}

export function getHealth() {
  return {
    status: 'ok',
    application: application.name,
    version: application.version,
    environment: environment.nodeEnv,
    timestamp: new Date().toISOString(),
  }
}

export function getVersion() {
  return {
    application: application.name,
    version: application.version,
  }
}

export function getIntegrationStatus() {
  const ctrader = getCTraderServiceStatus()
  const telegram = getTelegramServiceStatus()

  return {
    // Backward-compatible flat fields used by existing Admin status checks.
    dataSource: 'mock',
    cTrader: ctrader.connected ? 'connected' : 'not-connected',
    telegram: 'not-connected',
    monitoring: {
      active: true,
    },
    services: {
      ctrader,
      telegram,
    },
  }
}
