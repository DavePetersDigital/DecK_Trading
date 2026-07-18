import type { ErrorRequestHandler, RequestHandler } from 'express'
import { logger } from '../utils/logger.js'

export const notFoundHandler: RequestHandler = (request, response) => {
  response.status(404).json({
    success: false,
    error: `Endpoint not found: ${request.method} ${request.originalUrl}`,
  })
}

export const errorHandler: ErrorRequestHandler = (error: unknown, request, response, _next) => {
  logger.error(`Unhandled request error: ${request.method} ${request.originalUrl}`, error)

  if (response.headersSent) return

  response.status(500).json({
    success: false,
    error: 'Internal server error',
  })
}
