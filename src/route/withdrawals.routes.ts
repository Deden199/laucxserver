import express, { Router } from 'express'
import { requireClientAuth } from '../middleware/clientAuth'
import {
  listWithdrawals,
  retryWithdrawal,
  withdrawalCallback,
} from '../controller/withdrawals.controller'
import { requestWithdraw as createWithdrawal, validateAccount } from '../controller/clientDashboard.controller'

const router = Router()

// 1) Callback Hilogate (tanpa auth)
router.post(
  '/callback',
  express.raw({ type: 'application/json' }),
  withdrawalCallback,
)

// 2) Semua endpoint di bawah ini butuh authentication client
router.use(requireClientAuth)

// 2.a) Validasi rekening bank client
router.post(
  '/validate-account',
  express.json(),
  validateAccount
)

// 2.b) Submit withdrawal baru
router.post('/', createWithdrawal)

// 2.c) List semua withdrawal milik client
router.get('/', listWithdrawals)

// 2.d) Retry withdrawal yang gagal (optional)
router.post('/:id/retry', retryWithdrawal)

export default router
