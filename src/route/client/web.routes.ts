import express, { Router } from 'express'
import {
  getClientDashboard,
  exportClientTransactions,
  getClientCallbackUrl,

  updateClientCallbackUrl,
  retryTransactionCallback
} from '../../controller/clientDashboard.controller'
import { requireClientAuth } from '../../middleware/clientAuth'
import withdrawalRoutes from '../withdrawals.routes'
import { setupTOTP, enableTOTP, getTOTPStatus } from '../../controller/totp.controller'


const r = Router()

// 1) Protected: semua route berikut butuh token PARTNER_CLIENT
r.use(requireClientAuth)

// 2FA setup
r.post('/2fa/setup', setupTOTP)
r.post('/2fa/enable', express.json(), enableTOTP)
r.get('/2fa/status', getTOTPStatus)

// Callback settings
r.get('/callback-url', getClientCallbackUrl)
r.post('/callback-url', express.json(), updateClientCallbackUrl)
// Dashboard (saldo + transaksi)
r.get('/dashboard', getClientDashboard)
r.get('/dashboard/export', exportClientTransactions)
r.post('/callbacks/:id/retry', retryTransactionCallback)

// Withdrawal endpoints
r.use('/withdrawals', withdrawalRoutes)

export default r
