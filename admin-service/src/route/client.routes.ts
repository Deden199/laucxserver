import { Router } from 'express';
import { requireAdminAuth } from '../middleware/auth';
import * as ctrl from '../controller/client.controller';

const router = Router();

router.use(requireAdminAuth);

// 1) CRUD API‐Client
router.get('/',                ctrl.getAllClients);
router.post('/',               ctrl.createClient);
router.get('/:clientId',       ctrl.getClientById);
router.put('/:clientId',       ctrl.updateClient);

// 2) Dropdown PG‐Providers (jika masih diperlukan untuk referensi)
router.get('/providers',       ctrl.listProviders);
router.get('/:clientId/dashboard', ctrl.getClientDashboardAdmin);
router.get('/:clientId/withdrawals', ctrl.getClientWithdrawalsAdmin);
router.get('/:clientId/subwallets',  ctrl.getClientSubWallets);
router.post('/:clientId/reconcile-balance', ctrl.reconcileClientBalance);

export default router;
