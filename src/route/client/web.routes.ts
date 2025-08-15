import express, { Router } from 'express'
import {
  getClientDashboard,
  exportClientTransactions,
  getClientCallbackUrl,

  updateClientCallbackUrl,
  retryTransactionCallback
} from '../../controller/clientDashboard.controller'
import { requireClientAuth } from '../../middleware/clientAuth'
import axios from 'axios'
import { config } from '../../config'
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

// Withdrawal endpoints via withdrawal service
const withdrawalBase = config.api.withdrawalServiceUrl

r.post('/withdrawals/validate-account', express.json(), async (req, res) => {
  try {
    const { data } = await axios.post(
      `${withdrawalBase}/withdrawals/validate-account`,
      req.body,
      { headers: { Authorization: req.header('Authorization') ?? '' } }
    )
    res.json(data)
  } catch (err: any) {
    if (err.response) {
      res.status(err.response.status).json(err.response.data)
    } else {
      res.status(500).json({ error: 'Withdrawal service error' })
    }
  }
})

r.post('/withdrawals', express.json(), async (req, res) => {
  try {
    const { data } = await axios.post(
      `${withdrawalBase}/withdrawals`,
      req.body,
      { headers: { Authorization: req.header('Authorization') ?? '' } }
    )
    res.json(data)
  } catch (err: any) {
    if (err.response) {
      res.status(err.response.status).json(err.response.data)
    } else {
      res.status(500).json({ error: 'Withdrawal service error' })
    }
  }
})

r.get('/withdrawals', async (req, res) => {
  try {
    const { data } = await axios.get(`${withdrawalBase}/withdrawals`, {
      params: req.query,
      headers: { Authorization: req.header('Authorization') ?? '' },
    })
    res.json(data)
  } catch (err: any) {
    if (err.response) {
      res.status(err.response.status).json(err.response.data)
    } else {
      res.status(500).json({ error: 'Withdrawal service error' })
    }
  }
})

r.post('/withdrawals/:id/retry', express.json(), async (req, res) => {
  try {
    const { data } = await axios.post(
      `${withdrawalBase}/withdrawals/${req.params.id}/retry`,
      req.body,
      { headers: { Authorization: req.header('Authorization') ?? '' } }
    )
    res.json(data)
  } catch (err: any) {
    if (err.response) {
      res.status(err.response.status).json(err.response.data)
    } else {
      res.status(500).json({ error: 'Withdrawal service error' })
    }
  }
})

export default r
