import { Router } from 'express'
import {
  cTraderAccountsController,
  cTraderCallbackController,
  cTraderLoginController,
} from '../controllers/ctraderController.js'

export const cTraderRoutes = Router()

cTraderRoutes.get('/login', cTraderLoginController)
cTraderRoutes.get('/callback', cTraderCallbackController)
cTraderRoutes.get('/accounts', cTraderAccountsController)
