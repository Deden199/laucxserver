import { Router } from 'express'
import { clientLogin, clientRegister } from '../controller/clientAuth.controller'

const router = Router()
router.post('/login', clientLogin)
router.post('/register', clientRegister)

export default router
