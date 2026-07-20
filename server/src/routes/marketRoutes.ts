import { Router } from 'express'
import { marketStreamController } from '../controllers/marketController.js'

export const marketRoutes = Router()

marketRoutes.get('/stream', marketStreamController)
