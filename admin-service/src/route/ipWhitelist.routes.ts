import { Router } from 'express';
import { requireAdminAuth } from '../middleware/auth';
import { getIpWhitelist, updateIpWhitelist } from '../controller/ipWhitelist.controller';

const router = Router();

router.use(requireAdminAuth);

router.get('/', getIpWhitelist);
router.put('/', updateIpWhitelist);

export default router;
