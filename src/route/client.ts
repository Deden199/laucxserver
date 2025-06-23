// src/routes/client.ts
import { Router } from 'express'
import { clientLogin, clientRegister } from '../controller/clientAuth.controller'
import { requireClientAuth } from '../middleware/clientAuth'
import { getClientDashboard, requestWithdraw } from '../controller/clientDashboard.controller'

const r = Router()
r.post('/register', clientRegister)
r.post('/login', clientLogin)
r.use(requireClientAuth)
r.get('/dashboard', getClientDashboard)
r.post('/withdraw', requestWithdraw)

export default r
