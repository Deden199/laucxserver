import { Router } from 'express'
import { login, me } from '../controller/auth.controller'
import { authMiddleware } from '../middleware/auth'

const router = Router()
router.post('/login', login)
router.get('/me', authMiddleware, me)
export default router
