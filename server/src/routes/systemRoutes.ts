import { Router } from 'express'
import { healthController, statusController, versionController } from '../controllers/systemController.js'

export const systemRoutes = Router()

systemRoutes.get('/health', healthController)
systemRoutes.get('/version', versionController)
systemRoutes.get('/status', statusController)
