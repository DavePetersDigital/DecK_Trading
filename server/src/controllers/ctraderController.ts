import type { Request, Response } from 'express'
import {
  buildCTraderAuthorizationUrl,
  CTraderOAuthError,
  exchangeCTraderAuthorizationCode,
} from '../services/ctraderService.js'
import {
  sendCTraderOAuthErrorPage,
  sendCTraderOAuthSuccessPage,
  wantsCTraderOAuthHtml,
} from '../services/ctraderOAuthPages.js'
import { cTraderTrendbarPeriod } from '../protocol/ctraderAccountDiscoveryProtocol.js'
import {
  CTRADER_HISTORY_DEFAULT_COUNT,
  CTRADER_HISTORY_MAX_COUNT,
  getAuthorizedCTraderAccounts,
  getConfiguredCTraderHistory,
  getConfiguredCTraderSymbols,
} from '../services/ctraderAccountService.js'

export function cTraderLoginController(_request: Request, response: Response) {
  const authorizationUrl = buildCTraderAuthorizationUrl()

  if (!authorizationUrl) {
    response.status(500).json({
      success: false,
      error: 'Missing cTrader environment configuration.',
    })
    return
  }

  response.redirect(302, authorizationUrl)
}

export async function cTraderCallbackController(request: Request, response: Response) {
  const code = typeof request.query.code === 'string' ? request.query.code.trim() : ''
  const html = wantsCTraderOAuthHtml(request)

  if (!code) {
    const message = 'Missing authorization code.'
    if (html) {
      sendCTraderOAuthErrorPage(response, 400, message)
      return
    }
    response.status(400).json({
      success: false,
      error: message,
    })
    return
  }

  try {
    await exchangeCTraderAuthorizationCode(code)
    if (html) {
      sendCTraderOAuthSuccessPage(response)
      return
    }
    response.json({
      success: true,
      message: 'Successfully connected to cTrader.',
    })
  } catch (error) {
    const statusCode = error instanceof CTraderOAuthError ? error.statusCode : 502
    const message = error instanceof Error ? error.message : 'Failed to exchange cTrader authorization code.'
    if (html) {
      sendCTraderOAuthErrorPage(response, statusCode, message)
      return
    }
    response.status(statusCode).json({
      success: false,
      error: message,
    })
  }
}

export async function cTraderAccountsController(_request: Request, response: Response) {
  try {
    const accounts = await getAuthorizedCTraderAccounts()
    response.json({
      success: true,
      accounts,
    })
  } catch (error) {
    const statusCode = error instanceof CTraderOAuthError ? error.statusCode : 502
    const message = error instanceof Error ? error.message : 'Failed to retrieve cTrader accounts.'
    response.status(statusCode).json({
      success: false,
      error: message,
    })
  }
}

export async function cTraderSymbolsController(_request: Request, response: Response) {
  try {
    const symbolDiscovery = await getConfiguredCTraderSymbols()
    response.json({
      success: true,
      ...symbolDiscovery,
    })
  } catch (error) {
    const statusCode = error instanceof CTraderOAuthError ? error.statusCode : 502
    const message = error instanceof Error ? error.message : 'Failed to retrieve cTrader symbols.'
    response.status(statusCode).json({
      success: false,
      error: message,
    })
  }
}

export async function cTraderHistoryController(request: Request, response: Response) {
  const symbolId =
    typeof request.query.symbolId === 'string' ? request.query.symbolId.trim() : ''
  const timeframeRaw =
    typeof request.query.timeframe === 'string' ? request.query.timeframe.trim().toUpperCase() : ''
  const countRaw = typeof request.query.count === 'string' ? request.query.count.trim() : ''

  if (!symbolId || !/^\d+$/.test(symbolId)) {
    response.status(400).json({
      success: false,
      error: 'Missing or invalid symbolId.',
    })
    return
  }

  if (!(timeframeRaw in cTraderTrendbarPeriod)) {
    response.status(400).json({
      success: false,
      error: 'Invalid timeframe. Supported values: M5, M15, H1, H4, D1.',
    })
    return
  }

  const timeframe = timeframeRaw as keyof typeof cTraderTrendbarPeriod
  let count = CTRADER_HISTORY_DEFAULT_COUNT[timeframe]

  if (countRaw !== '') {
    const parsedCount = Number(countRaw)
    if (!Number.isInteger(parsedCount) || parsedCount < 1 || parsedCount > CTRADER_HISTORY_MAX_COUNT) {
      response.status(400).json({
        success: false,
        error: `Invalid count. Must be an integer between 1 and ${CTRADER_HISTORY_MAX_COUNT}.`,
      })
      return
    }
    count = parsedCount
  }

  try {
    const candles = await getConfiguredCTraderHistory({ symbolId, timeframe, count })
    response.json(candles)
  } catch (error) {
    const statusCode = error instanceof CTraderOAuthError ? error.statusCode : 502
    const message = error instanceof Error ? error.message : 'Failed to retrieve cTrader history.'
    response.status(statusCode).json({
      success: false,
      error: message,
    })
  }
}
