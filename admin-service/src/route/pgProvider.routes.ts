import { Router } from 'express';
import { listProviders } from '../controller/pgProvider.controller';
import { requireAdminAuth } from '../middleware/auth';

const router = Router();

router.use(requireAdminAuth);

router.get('/', listProviders);

export default router;
