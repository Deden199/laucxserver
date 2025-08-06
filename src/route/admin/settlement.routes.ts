import { Router } from 'express'
import { requireAdminAuth } from '../../middleware/auth'
import { run, status } from '../../controller/admin/settlement.controller'

const r = Router()

r.use(requireAdminAuth)

r.post('/run', run)
r.get('/status', status)

export default r
