import { Router } from 'express'
import { systemRoutes } from './systemRoutes.js'

export const apiRoutes = Router()

// Authentication middleware can be inserted here later without changing
// controllers or business services.
apiRoutes.use(systemRoutes)
