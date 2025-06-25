import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import cron from 'node-cron';
import { scheduleSettlementChecker } from './cron/settlement'
import subMerchantRoutes from './route/admin/subMerchant.routes';
import pgProviderRoutes from './route/admin/pgProvider.routes';
import adminMerchantRoutes from './route/admin/merchant.routes';
import adminClientRoutes from './route/admin/client.routes';
import { withdrawalCallback } from './controller/withdrawals.controller'

import ewalletRoutes from './route/ewallet.routes';
import authRoutes from './route/auth.routes';
import paymentRouter from './route/payment.routes';
import disbursementRouter from './route/disbursement.routes';
import paymentController, { transactionCallback } from './controller/payment';

import merchantDashRoutes from './route/merchant/dashboard.routes';
import clientWebRoutes from './route/client/web.routes';    // partner-client routes
import withdrawalRoutes from './route/withdrawals.routes';  // add withdrawal routes

import apiKeyAuth from './middleware/apiKeyAuth';
import { authMiddleware } from './middleware/auth';

import { config, swaggerConfig } from './config';
import logger from './logger';
import requestLogger from './middleware/log';

const app = express();
app.disable('etag');

// No-cache headers
app.use((_, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// Raw parser for Hilogate transaction webhook
app.post(
  '/api/v1/transactions/callback',
  express.raw({
    limit: '20kb',
    type: () => true,
    verify: (req, _res, buf: Buffer) => { (req as any).rawBody = buf; }
  }),
  express.json(),
  transactionCallback
);
app.post(
  '/api/v1/withdrawals/callback',
  express.raw({
    limit: '20kb',
    type: () => true,
    verify: (req, _res, buf: Buffer) => { (req as any).rawBody = buf }
  }),
  express.json(),           // agar handler bebas parse JSON lagi jika perlu
  withdrawalCallback        // handler yang sudah Anda tulis
)
// Raw parser for Hilogate withdrawal webhook


// Global middleware
app.set('trust proxy', 1);
app.use(helmet());
app.use(rateLimit({ windowMs: 60_000, max: 100, message: 'Too many requests, try again later.' }));
app.use('/swagger', swaggerUi.serve, swaggerUi.setup(swaggerJsdoc(swaggerConfig)));

const allowedOrigins = [
  'https://launcx.com',
  'https://checkout1.launcx.com',
  'https://altcheckout.launcx.com',
  'https://g2f.launcx.com',
  'https://payment.launcx.com',
  'https://c1.launcx.com',
  'http://localhost:3000',
  'http://localhost:3001',
  `http://localhost:${config.api.port}`,
];
app.use(cors({
  origin: (origin, cb) => cb(null, !origin || allowedOrigins.includes(origin)),
  credentials: true,
}));
app.use(requestLogger);

// JSON body parser
app.use(express.json({ limit: '20kb' }));
app.use('/api/v1/withdrawals', withdrawalRoutes,)
/* ========== 1. PUBLIC ROUTES ========== */
app.use('/api/v1/auth', authRoutes);       // login / register for admins and clients
app.use('/api/v1', ewalletRoutes);         // public e-wallet endpoints

/* ========== 2. PROTECTED – API-KEY (SERVER-TO-SERVER) ========== */
app.use('/api/v1/payments', apiKeyAuth, paymentRouter);
app.use('/api/v1/disbursements', apiKeyAuth, disbursementRouter);

/* ========== 3. PROTECTED – ADMIN PANEL ========== */
app.use('/api/v1/admin/merchants', authMiddleware, adminMerchantRoutes);
app.use('/api/v1/admin/merchants/:id/pg', authMiddleware, subMerchantRoutes);
app.use('/api/v1/admin/pg-providers', authMiddleware, pgProviderRoutes);
app.use('/api/v1/admin/clients', authMiddleware, adminClientRoutes);

/* ========== 4. PARTNER-CLIENT (login/register + dashboard + withdraw) ========== */
app.use('/api/v1/client', clientWebRoutes);


/* ========== 5. PROTECTED – MERCHANT DASHBOARD ========== */
app.use('/api/v1/merchant/dashboard', authMiddleware, merchantDashRoutes);

// Global error handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  logger.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

/* ========== 6. SCHEDULED TASKS ========== */
scheduleSettlementChecker()
// Start server
app.listen(config.api.port, () => {
  console.log(`🚀 Server listening on http://localhost:${config.api.port}/api/v1`);
  console.log(`🔖 Swagger UI available at http://localhost:${config.api.port}/swagger`);
});

export default app;
