import { Router } from 'express'
import { getMarketEventsController } from '../controllers/orbController.js'
import { cTraderRoutes } from './ctraderRoutes.js'
import { instrumentRoutes } from './instrumentRoutes.js'
import { marketRoutes } from './marketRoutes.js'
import { openingProfileRoutes } from './openingProfileRoutes.js'
import { orbRoutes } from './orbRoutes.js'
import { systemRoutes } from './systemRoutes.js'

export const apiRoutes = Router()

// Authentication middleware can be inserted here later without changing
// controllers or business services.
apiRoutes.use('/ctrader', cTraderRoutes)
apiRoutes.use('/market', marketRoutes)
apiRoutes.use('/instruments', instrumentRoutes)
apiRoutes.use('/opening-profiles', openingProfileRoutes)
apiRoutes.use('/orb', orbRoutes)
apiRoutes.get('/market-events', getMarketEventsController)
apiRoutes.use(systemRoutes)
