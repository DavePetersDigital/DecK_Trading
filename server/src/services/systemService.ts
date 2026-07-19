import { environment } from '../config/environment.js'
import { getCTraderAccessToken } from './ctraderService.js'

export const application = {
  name: 'DecK Trading Dashboard',
  version: '0.1.0',
} as const

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
  return {
    dataSource: 'mock',
    cTrader: getCTraderAccessToken() ? 'connected' : 'not-connected',
    telegram: 'not-connected',
  }
}
