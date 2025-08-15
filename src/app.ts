import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cors from 'cors';

import routes from './route/routes';
import { config } from './config';
import logger from './logger';

const app = express();

// Basic security and rate limiting
app.use(cors({ origin: true, credentials: true }));
app.use(helmet());
app.use(rateLimit({ windowMs: 60_000, max: 100 }));
app.use(express.json({ limit: '20kb' }));

// Register gateway routes
app.use('/', routes);

// Basic error handler to avoid leaking server errors
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  logger.error(err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Start server when executed directly
if (require.main === module) {
  app.listen(config.api.port, () => {
    logger.info(`API Gateway running on port ${config.api.port}`);
  });
}

export default app;

