// src/app.ts
import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cors, { CorsOptions } from 'cors';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

import { config, swaggerConfig } from './config';
console.log('🚀 Starting server with expectedApiKey =', config.api.expectedApiKey);

import logger from './logger';
import requestLogger from './middleware/log';
import apiKeyAuth from './middleware/apiKeyAuth';

import paymentRouter from './route/payment.routes';
import disbursementRouter from './route/disbursement.routes';
// import other routers if needed, e.g. v2, auth, etc.

const app = express();

// 1. Security headers
app.use(helmet());

// 2. JSON parser with size limit
app.use(express.json({ limit: '20kb' }));

// 3. Rate limiting
app.use(
  rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100, // limit each IP
    message: 'Too many requests from this IP, please try again later.',
  })
);

// 4. Health-check endpoint
app.get('/', (_req: Request, res: Response) => {
  res.status(200).send(`✅ Server is running on port ${config.api.port}`);
});

// 5. Swagger UI (dev only)
const swaggerSpec = swaggerJsdoc(swaggerConfig);
app.use('/swagger', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// 6. Bind async context
app.use((req: Request, _res: Response, next: NextFunction) => {
  // if using async context utility
  // Context.bind(req);
  next();
});

// 7. CORS setup
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

// 8. Request logging
app.use(requestLogger);

// 9. Mount V1 routes with API-key auth
app.use('/api/v1/payments', apiKeyAuth, paymentRouter);
app.use('/api/v1/disbursements', apiKeyAuth, disbursementRouter);

// 10. Mount additional routers (e.g. v2, auth) if any
// app.use('/api/v2', authRouter, v2Router);

// 11. Global error handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  logger.error(err);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Internal Server Error' });
});

// 12. Start server
app.listen(config.api.port, () => {
  console.log(`🚀 Server listening on http://localhost:${config.api.port}/api/v1`);
  console.log(`🔖 Swagger UI available at http://localhost:${config.api.port}/swagger`);
});