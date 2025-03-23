import { Router } from 'express';
import paymentRouter from './payment.routes';
import disbursementRouter from './disbursement.routes';
import paymentRouterV2 from "./payment.v2.routes";
import disbursementRouterV2 from './disbursement.v2.routes';
import { authErrorHandler, authMiddleware } from '../middleware/auth';
import authRouter from './auth.routes';


const router = Router();
router.use('/auth', authRouter);

const v1 = Router();
v1.use('/', paymentRouter);
v1.use('/', disbursementRouter);


const v2 = Router();
v2.use('/payments', paymentRouterV2);
v2.use('/disbursement', disbursementRouterV2);

router.use('/', v1); // All v1 APIs will be under /
router.use('/v2', v2); // All v2 APIs will be under /v2

router.use(authErrorHandler);

export default router;
