import { Router } from 'express'
import {
  cTraderAccountsController,
  cTraderCallbackController,
  cTraderHistoryController,
  cTraderLoginController,
  cTraderSymbolsController,
} from '../controllers/ctraderController.js'

export const cTraderRoutes = Router()

cTraderRoutes.get('/login', cTraderLoginController)
cTraderRoutes.get('/callback', cTraderCallbackController)
cTraderRoutes.get('/accounts', cTraderAccountsController)
cTraderRoutes.get('/symbols', cTraderSymbolsController)
cTraderRoutes.get('/history', cTraderHistoryController)
