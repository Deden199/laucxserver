// src/route/client/web.routes.ts
import { Router } from 'express'
import {
  clientRegister,
  clientLogin
} from '../../controller/clientAuth.controller'
import {
  requireClientAuth
} from '../../middleware/clientAuth'
import {
  getClientDashboard,
  exportClientTransactions,
  requestWithdraw
} from '../../controller/clientDashboard.controller'  // pastikan path ini sesuai

const r = Router()

// 1) Public: register & login
r.post('/register', clientRegister)
r.post('/login',    clientLogin)

// 2) Protected: semua route berikut butuh token PARTNER_CLIENT
r.use(requireClientAuth)

// 2.a) Lihat dashboard (saldo + transaksi)
r.get ('/dashboard',         getClientDashboard)

// 2.b) Export Excel
r.get ('/dashboard/export',  exportClientTransactions)

// 2.c) Request withdraw
r.post('/dashboard/withdraw', requestWithdraw)

export default r
