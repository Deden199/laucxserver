import { Router } from 'express';
import * as ctrl from '../controller/merchant.controller';
import { requireAdminAuth } from '../middleware/auth';
import subMerchantRouter from './subMerchant.routes';

const router = Router();

router.use(requireAdminAuth);

// Regenerate API Key untuk partner clients
router.post('/api-key', ctrl.regenerateApiKey);

// Merchant CRUD
router.post('/',    ctrl.createMerchant);
router.get('/',     ctrl.getAllMerchants);
router.get('/allclient',     ctrl.getAllClient);

router.get('/:merchantId/balances', ctrl.getMerchantBalances);

router.get('/:id',  ctrl.getMerchantById);
router.patch('/:id',      ctrl.updateMerchant);
router.patch('/:id/fee',  ctrl.setFeeRate);
router.delete('/:id',     ctrl.deleteMerchant);

// Manage PG connections (sub-merchant)
router.get('/:id/pg',           ctrl.listPGs);
router.post('/:id/pg',          ctrl.connectPG);
router.patch('/:id/pg/:subId',  ctrl.updatePGFee);
router.delete('/:id/pg/:subId', ctrl.disconnectPG);
router.use('/:id/pg', subMerchantRouter);

export default router;
