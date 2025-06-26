// File: src/route/client/web.routes.ts
import express, { Router } from 'express'
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
  requestWithdraw,
  validateAccount,         // import validateAccount
  getClientCallbackUrl,    // ⬅️ import handler baru
  updateClientCallbackUrl  // ⬅️ import handler baru
} from '../../controller/clientDashboard.controller'
import {
  listWithdrawals,
  retryWithdrawal
} from '../../controller/withdrawals.controller'

const r = Router()

// 1) Public: register & login
r.post('/register', clientRegister)
r.post('/login',    clientLogin)

// 2) Protected: semua route berikut butuh token PARTNER_CLIENT
r.use(requireClientAuth)

// ————————————————————————————————
// 2.x) Callback Settings
r.get(
  '/callback-url',
  getClientCallbackUrl
)
r.post(
  '/callback-url',
  express.json(),
  updateClientCallbackUrl
)
// ————————————————————————————————

// 2.a) Lihat dashboard (saldo + transaksi)
r.get('/dashboard',        getClientDashboard)

// 2.b) Export Excel
r.get('/dashboard/export', exportClientTransactions)

// 2.c) Request withdraw via dashboard endpoint
r.post('/dashboard/withdraw', requestWithdraw)

// 2.d) Validate rekening bank client
r.post(
  '/withdrawals/validate-account',
  express.json(),
  validateAccount
)

// 2.e) Create withdrawal (alias submit)
r.post(
  '/withdrawals',
  express.json(),
  requestWithdraw
)

// 2.f) List semua withdrawal milik client
r.get('/withdrawals', listWithdrawals)

// 2.g) Retry withdrawal yang gagal (optional)
r.post('/withdrawals/:id/retry', retryWithdrawal)

export default r
