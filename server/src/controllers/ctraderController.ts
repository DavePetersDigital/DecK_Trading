import type { Request, Response } from 'express'
import {
  buildCTraderAuthorizationUrl,
  CTraderOAuthError,
  exchangeCTraderAuthorizationCode,
} from '../services/ctraderService.js'
import { getAuthorizedCTraderAccounts } from '../services/ctraderAccountService.js'

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

  if (!code) {
    response.status(400).json({
      success: false,
      error: 'Missing authorization code.',
    })
    return
  }

  try {
    await exchangeCTraderAuthorizationCode(code)
    response.json({
      success: true,
      message: 'Successfully connected to cTrader.',
    })
  } catch (error) {
    const statusCode = error instanceof CTraderOAuthError ? error.statusCode : 502
    const message = error instanceof Error ? error.message : 'Failed to exchange cTrader authorization code.'
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
