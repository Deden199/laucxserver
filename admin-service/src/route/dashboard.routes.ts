import { Router } from 'express';
import * as ctrl from '../controller/merchant.controller';
import { requireAdminAuth, requireSuperAdminAuth } from '../middleware/auth';
import { adminIpWhitelist } from '../middleware/ipWhitelist';

const router = Router();
router.use(requireAdminAuth);

router.get('/transactions', ctrl.getDashboardTransactions);
router.get('/summary',      ctrl.getDashboardSummary);
router.get('/profit',       ctrl.getPlatformProfit);
router.get('/profit-submerchant', ctrl.getProfitPerSubMerchant);
router.get('/withdrawals',  ctrl.getDashboardWithdrawals);
router.post('/withdraw', adminIpWhitelist, requireSuperAdminAuth, ctrl.adminWithdraw);
router.post('/validate-account', requireSuperAdminAuth, ctrl.adminValidateAccount);
router.get('/admin-withdrawals', requireSuperAdminAuth, ctrl.getAdminWithdrawals);
router.get('/export-all',   ctrl.exportDashboardAll);

export default router;
