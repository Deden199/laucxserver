// src/route/routes.ts
import { Router } from 'express';
import paymentRouter from './payment.routes';
import disbursementRouter from './disbursement.routes';
import paymentRouterV2 from './payment.v2.routes';
import disbursementRouterV2 from './disbursement.v2.routes';
import authRouter from './auth.routes';
import transactionsRouter from './transactions.routes';
import { authMiddleware } from '../middleware/auth';
import { apiKeyAuth } from '../middleware/apiKeyAuth';  // ← import API-Key middleware
import { disburse } from '../service/ifpDisbursement';

const router = Router();

// 1) Public: authentication endpoints
router.use('/auth', authRouter);

// 2) Proteksi V1 API dengan API-Key + HMAC signature
//    Setiap request ke /payments & /disbursements wajib kirim:
//    X-API-KEY, X-TIMESTAMP, X-SIGNATURE
router.use(apiKeyAuth);
router.use('/payments', paymentRouter);
router.use('/disbursements', disbursementRouter);

// 3) Setelah V1, lanjutkan dengan proteksi JWT untuk partner UI/admin
router.use(authMiddleware);

// 4) IFP Disbursement (requires JWT)
router.post('/ifp/disburse', async (req, res) => {
  try {
    const { data } = await disburse(req.body);
    res.json(data);
  } catch (err: any) {
    res
      .status(500)
      .json(err.response?.data ?? { message: err.message });
  }
});

// 5) Transactions (history) — juga protected JWT
router.use('/transactions', transactionsRouter);

// 6) Protected V2 (JWT)
router.use('/v2/payments', paymentRouterV2);
router.use('/v2/disbursement', disbursementRouterV2);

export default router;
