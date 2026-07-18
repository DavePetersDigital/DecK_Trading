import type { Request, Response } from 'express'
import { getHealth, getIntegrationStatus, getVersion } from '../services/systemService.js'

export function healthController(_request: Request, response: Response) {
  response.json(getHealth())
}

export function versionController(_request: Request, response: Response) {
  response.json(getVersion())
}

export function statusController(_request: Request, response: Response) {
  response.json(getIntegrationStatus())
}
