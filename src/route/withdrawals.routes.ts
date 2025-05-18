import { Router } from 'express'
import { listWithdrawals, retryWithdrawal } from '../controller/withdrawals.controller'
import { authMiddleware } from '../middleware/auth'

const router = Router()
router.use(authMiddleware)
router.get('/', listWithdrawals)
router.post('/:id/retry', retryWithdrawal)
export default router
