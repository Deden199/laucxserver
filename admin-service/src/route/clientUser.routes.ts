import { Router } from 'express';
import { requireAdminAuth, requireSuperAdminAuth } from '../middleware/auth';
import { listClientUsers, createClientUser, deleteClientUser } from '../controller/clientUser.controller';

const router = Router({ mergeParams: true });

router.use(requireAdminAuth);

router.get('/', listClientUsers);
router.post('/', requireSuperAdminAuth, createClientUser);
router.delete('/:userId', deleteClientUser);

export default router;
