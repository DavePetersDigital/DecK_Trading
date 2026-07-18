import express from 'express'
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js'
import { requestLogger } from './middleware/requestLogger.js'
import { apiRoutes } from './routes/index.js'

export const app = express()

app.disable('x-powered-by')
app.use(express.json())
app.use(requestLogger)

app.use('/api', apiRoutes)

app.use(notFoundHandler)
app.use(errorHandler)
