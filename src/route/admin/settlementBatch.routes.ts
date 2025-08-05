import { Router } from 'express';
import { runBatch } from '../../controller/admin/settlementBatch.controller';
import { AuthRequest } from '../../middleware/auth';

const router = Router();

// Only allow admins
router.use((req: AuthRequest, res, next) => {
  if (req.userRole !== 'ADMIN' && req.userRole !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
});

router.post('/run', runBatch);

export default router;
