import { Router, Request, Response, NextFunction } from 'express'
import * as ctrl from '../../controller/admin/merchant.controller'
import { authMiddleware, AuthRequest } from '../../middleware/auth'

const router = Router()

// Semua route berikut hanya untuk ADMIN
router.use(authMiddleware, (req: Request, res: Response, next: NextFunction) => {
  const { userRole } = req as AuthRequest
  if (userRole !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden' })
  }
  next()
})

// Regenerate API Key
router.post('/api-key', ctrl.regenerateApiKey)

// Merchant CRUD
router.post('/',        ctrl.createMerchant)
router.get('/',         ctrl.getAllMerchants)

// Manage PG connections
router.get('/:id/pg',           ctrl.listPGs)
router.post('/:id/pg',          ctrl.connectPG)
router.patch('/:id/pg/:subId',  ctrl.updatePGFee)
router.delete('/:id/pg/:subId', ctrl.disconnectPG)

// Single merchant operations
router.get('/:id',        ctrl.getMerchantById)
router.patch('/:id',      ctrl.updateMerchant)
router.patch('/:id/fee',  ctrl.setFeeRate)
router.delete('/:id',     ctrl.deleteMerchant)

export default router
