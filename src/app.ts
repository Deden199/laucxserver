// src/app.ts
import express, { Request, Response, NextFunction } from 'express';
import { config, swaggerConfig } from './config';
import cors, { CorsOptions } from 'cors';
import router from './route/routes';
import Context from './util/context';
import logger from './logger';
import requestLogger from './middleware/log';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const app = express();

// 1. JSON parser
app.use(express.json());

// 2. Health-check endpoint
app.get('/', (_req: Request, res: Response) => {
  res.status(200).send(`✅ Server is running on port ${config.api.port}`);
});

// 3. Swagger UI (selalu aktif di dev)
const swaggerSpec = swaggerJsdoc(swaggerConfig);
app.use('/swagger', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// 4. Bind async context
app.use((req: Request, _res: Response, next: NextFunction) => {
  Context.bind(req);
  next();
});

// 5. CORS setup
const allowedOrigins = [
  'https://launcx.com',
  'http://localhost:3001',
  `http://localhost:${config.api.port}`,
];
const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
};
app.use(cors(corsOptions));

// 6. Request logging
app.use(requestLogger);

// 7. Mount all routes under /api/v1
app.use('/api/v1', router);

// 8. Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error(err);
  res.status(500).json({ error: err.message });
});

// 9. Start server
app.listen(config.api.port, () => {
  console.log(`🚀 Server listening on http://localhost:${config.api.port}/api/v1`);
  console.log(`🔖 Swagger UI available at http://localhost:${config.api.port}/swagger`);
});
