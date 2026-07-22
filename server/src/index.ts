import { app } from './app.js'
import { environment } from './config/environment.js'
import { logger } from './utils/logger.js'
import { startOrbEngine } from './services/orb/orbEngine.js'

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', reason)
})

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error)
  process.exit(1)
})

app.listen(environment.port, 'localhost', () => {
  logger.info(`DecK Trading Dashboard API listening on http://localhost:${environment.port}`)
  // The ORB engine runs headless on the backend, independent of any browser tab.
  void startOrbEngine().catch((error) => logger.error('Failed to start ORB engine.', error))
})
