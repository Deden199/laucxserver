import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth'
import * as ctrl from '../../controller/admin/client.controller'

const router = Router()

// semua route butuh ADMIN
router.use(authMiddleware, (req, res, next) => {
  if ((req as any).userRole !== 'ADMIN') return res.status(403).end()
  next()
})

// 1) CRUD API‐Client
router.get('/',       ctrl.getAllClients)
router.post('/',      ctrl.createClient)

// 2) Dropdown PG‐Providers (harus literal sebelum :clientId)
router.get('/providers', ctrl.listProviders)

// 3) Koneksi PG per client (letakkan BEFORE `/:clientId`)
router.get('/:clientId/pg',        ctrl.listClientPG)
router.post('/:clientId/pg',       ctrl.createClientPG)
router.patch('/:clientId/pg/:id',  ctrl.updateClientPG)
router.delete('/:clientId/pg/:id', ctrl.deleteClientPG)

// 4) Get detail satu client
router.get('/:clientId', ctrl.getClientById)

export default router
