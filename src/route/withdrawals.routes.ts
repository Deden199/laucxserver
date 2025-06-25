import express, { Router } from 'express'
import { requireClientAuth } from '../middleware/clientAuth'
import {
  listWithdrawals,
  retryWithdrawal,
  withdrawalCallback,
} from '../controller/withdrawals.controller'
import { requestWithdraw as createWithdrawal, validateAccount } from '../controller/clientDashboard.controller'

const router = Router()



// 2) Semua endpoint di bawah ini butuh authentication client
router.use(requireClientAuth)

// 2.a) Validasi rekening bank client (pakai JSON parser)
router.post(
  '/validate-account',
  express.json(),
  validateAccount
)

// 2.b) Submit withdrawal baru (tambahkan JSON parser)
router.post(
  '/',
  express.json(),
  createWithdrawal
)

// 2.c) List semua withdrawal milik client (GET, no body parser needed)
router.get('/', listWithdrawals)

// 2.d) Retry withdrawal yang gagal (tambahkan JSON parser)
router.post(
  '/:id/retry',
  express.json(),
  retryWithdrawal
)

export default router
