import type { NextFunction, Request, Response } from 'express'
import { logger } from '../utils/logger.js'

export function requestLogger(request: Request, response: Response, next: NextFunction) {
  const startedAt = performance.now()

  response.on('finish', () => {
    const duration = performance.now() - startedAt
    logger.info(`${request.method} ${request.originalUrl} ${response.statusCode} ${duration.toFixed(1)}ms`)
  })

  next()
}
