// src/route/routes.ts
import { Router } from 'express';
import { authMiddleware }   from '../middleware/auth';
import internalRouter       from './internal.routes';

const router = Router();

// Proteksi JWT untuk partner UI/admin
router.use(authMiddleware);

router.use('/internal', internalRouter);

export default router;
