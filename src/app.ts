// src/app.ts
import express, { Request, Response, NextFunction } from 'express';
import helmet                    from 'helmet';
import rateLimit                 from 'express-rate-limit';
import cors                      from 'cors';
import swaggerJsdoc              from 'swagger-jsdoc';
import swaggerUi                 from 'swagger-ui-express';
import ewalletRoutes from './route/ewallet.routes';

import { config, swaggerConfig } from './config';
import logger                    from './logger';
import requestLogger             from './middleware/log';
import apiKeyAuth                from './middleware/apiKeyAuth';
import paymentController         from './controller/payment';
import paymentRouter             from './route/payment.routes';
import disbursementRouter        from './route/disbursement.routes';
import { transactionCallback } from './controller/payment';

const app = express();

/* ────────────────────────────────────────────────────────────────
   0.  Parser RAW  (WAJIB paling atas, hanya untuk webhook Hilogate)
   ──────────────────────────────────────────────────────────────── */
app.post(
  '/api/v1/transactions/callback',
  express.raw({
    limit : '20kb',
    type  : () => true,                         // terima semua Content-Type
    verify: (req, _res, buf: Buffer) => {
      console.log('VERIFY len =', buf.length);  // debug—hapus nanti
      (req as any).rawBody = buf;               // simpan Buffer mentah
    },
  }),
  // setelah raw, parse JSON agar req.body tetap terisi
  express.json(),
  // lalu panggil handler-mu
  transactionCallback
);

/* ────────────────────────────────────────────────────────────────
   1.  Middleware umum
   ──────────────────────────────────────────────────────────────── */
app.set('trust proxy', 1);                      // X-Forwarded-For untuk rate-limit
app.use(helmet());

app.use(rateLimit({
  windowMs: 60_000,
  max     : 100,
  message : 'Too many requests, try again later.'
}));

app.use('/swagger', swaggerUi.serve,
  swaggerUi.setup(swaggerJsdoc(swaggerConfig)));

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

app.use(requestLogger);                         // bebas menyentuh req.body – raw sudah tersalin

/* ────────────────────────────────────────────────────────────────
   2.  Parser JSON global (setelah raw)
   ──────────────────────────────────────────────────────────────── */
app.use(express.json({ limit: '20kb' }));

/* ────────────────────────────────────────────────────────────────
   3.  ROUTES
   ──────────────────────────────────────────────────────────────── */
// Public callback (tidak pakai API-KEY)
app.post('/api/v1/transactions/callback',
  paymentController.transactionCallback);

// Protected routes
app.use('/api/v1/payments', apiKeyAuth, paymentRouter);
app.use('/api/v1/disbursements', apiKeyAuth, disbursementRouter);
app.use('/api/v1', ewalletRoutes);

/* ────────────────────────────────────────────────────────────────
   4.  Global error handler
   ──────────────────────────────────────────────────────────────── */
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  logger.error(err);
  res.status(err.status || 500)
     .json({ error: err.message || 'Internal Server Error' });
});

/* ────────────────────────────────────────────────────────────────
   5.  Start server
   ──────────────────────────────────────────────────────────────── */
app.listen(config.api.port, () => {
  console.log(`🚀 Server listening on http://localhost:${config.api.port}/api/v1`);
  console.log(`🔖 Swagger UI available at http://localhost:${config.api.port}/swagger`);
});
