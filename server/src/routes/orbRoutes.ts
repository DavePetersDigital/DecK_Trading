import { Router } from 'express'
import {
  getMarketEventsController,
  getOrbAlertsController,
  getOrbStateController,
} from '../controllers/orbController.js'

export const orbRoutes = Router()

orbRoutes.get('/state', getOrbStateController)
orbRoutes.get('/alerts', getOrbAlertsController)
orbRoutes.get('/market-events', getMarketEventsController)
