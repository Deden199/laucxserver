// src/app.ts
import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cors, { CorsOptions } from 'cors';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

import { config, swaggerConfig } from './config';
import logger from './logger';
import requestLogger from './middleware/log';
import apiKeyAuth from './middleware/apiKeyAuth';
import paymentController from './controller/payment';
import paymentRouter from './route/payment.routes';
import disbursementRouter from './route/disbursement.routes';

const app = express();

// 1. Trust proxy (untuk X-Forwarded-For di rate-limit)
app.set('trust proxy', 1);

// 2. Security headers
app.use(helmet());

// 3. Rate limiting (global)
app.use(rateLimit({
  windowMs: 60_000,
  max: 100,
  message: 'Too many requests, try again later.'
}));

// 4. Swagger UI (dev)
app.use('/swagger', swaggerUi.serve, swaggerUi.setup(swaggerJsdoc(swaggerConfig)));

// 5. CORS
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
const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) callback(null, true);
    else callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
};
app.use(cors(corsOptions));

// 6. Request logging
app.use(requestLogger);

// 7. CALLBACK PUBLIC (raw body) — TANPA API-KEY
app.post(
  '/api/v1/transaction/callback',
  express.raw({
    type: 'application/json',
    limit: '20kb',
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf.toString('utf8');
    },
  }),
  paymentController.transactionCallback
);
// 8. JSON parser untuk semua route setelahnya
app.use(express.json({ limit: '20kb' }));

// 9. Protected Routes (butuh API-KEY)
app.use('/api/v1/payments', apiKeyAuth, paymentRouter);
app.use('/api/v1/disbursements', apiKeyAuth, disbursementRouter);

// 10. Global error handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  logger.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

// 11. Start server
app.listen(config.api.port, () => {
  console.log(`🚀 Server listening on http://localhost:${config.api.port}/api/v1`);
  console.log(`🔖 Swagger UI available at http://localhost:${config.api.port}/swagger`);
});
