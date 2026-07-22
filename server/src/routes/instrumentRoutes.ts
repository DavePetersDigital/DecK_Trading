import { Router } from 'express'
import {
  createMonitoredInstrumentController,
  deleteMonitoredInstrumentController,
  listMonitoredInstrumentsController,
  updateMonitoredInstrumentController,
} from '../controllers/monitoredInstrumentController.js'

export const instrumentRoutes = Router()

instrumentRoutes.get('/monitored', listMonitoredInstrumentsController)
instrumentRoutes.post('/monitored', createMonitoredInstrumentController)
instrumentRoutes.patch('/monitored/:symbolId', updateMonitoredInstrumentController)
instrumentRoutes.delete('/monitored/:symbolId', deleteMonitoredInstrumentController)
