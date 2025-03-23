import express, { Request, Response } from 'express';
import { config, swaggerConfig } from './config';
import cors from 'cors';
import router from './route/routes';
import Context from './util/context';
import logger from './logger';
import requestLogger from './middleware/log';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const app = express();

if (config.node_env == 'development') {
  const swaggerSpec = swaggerJsdoc(swaggerConfig);
  app.use('/swagger', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

app.use((req, res, next) => {
    Context.bind(req);
    next();
});

const allowedOrigins = ['https://launcx.com', 'http://localhost:3000', 'https://www.launcx.com', 'https://qris.link', 'https://www.qris.link', 'https://laucnxfrontend.vercel.app',`${config.api.swaggerUrl}`];
// CORS options to allow specific origins
const corsOptions: cors.CorsOptions = {
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        // Allow requests with no origin (e.g., mobile apps, Postman)
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
  };

  
// use cors
  
app.use(cors(corsOptions));
app.use(requestLogger);
app.use(express.json());
app.use(router);

app.listen(config.api.port, () => {
    console.log('Server is listening on port ' + config.api.port + '!');
});