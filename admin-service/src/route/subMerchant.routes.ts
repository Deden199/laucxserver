import { Router } from 'express';
import * as ctrl from '../controller/subMerchant.controller';
import { requireAdminAuth } from '../middleware/auth';

const router = Router({ mergeParams: true });

router.use(requireAdminAuth);

router.get('/',       ctrl.listSubMerchants);
router.post('/',      ctrl.createSubMerchant);
router.delete('/:subId', ctrl.deleteSubMerchant);
router.patch('/:subId',  ctrl.updateSubMerchant);

export default router;
