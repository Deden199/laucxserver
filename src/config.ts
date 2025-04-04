// Config

import dotenv from 'dotenv';
dotenv.config();

export const config = {
  api: {
    baseUrl: process.env.BASE_URL || 'http://localhost',
    swaggerUrl: process.env.SWAGGER_URL || 'http://localhost:6000',
    port: process.env.PORT || 6000,
    callbackUrl: process.env.CALLBACK_URL || 'http://localhost:3000/orders/',
    callbackFinishUrl: process.env.CALLBACK_URL_FINISH || '',
    netz: {
      url: process.env.NETZ_URL || 'https://tokoapisnap-stg.netzme.com',
      partnerId: process.env.NETZ_PARTNER_ID || '',
      privateKey: process.env.NETZ_PRIVATE_KEY || '',
      clientSecret: process.env.NETZ_CLIENT_SECRET || '',
    },
    brevo: {
      url: process.env.BREVO_URL || 'https://api.brevo.com/v3/smtp/email',
      apiKey: process.env.BREVO_API_KEY || '',
    },
    auth0: {
      domain: process.env.AUTH0_DOMAIN || '',
      clientId: process.env.AUTH0_CLIENT_ID || '',
      clientSecret: process.env.AUTH0_CLIENT_SECRET || '',
      managementId: process.env.AUTH0_MANAGEMENT_ID || '',
      managementSecret: process.env.AUTH0_MANAGEMENT_SECRET || '',
      audience: process.env.AUTH0_AUDIENCE || '',
      testToken: process.env.AUTH0_TEST_TOKEN || '',
    },
    telegram: {
      botToken: process.env.TELEGRAM_BOT_TOKEN,
      adminChannel: process.env.TELEGRAM_ADMIN_CHANNEL,
    },
    gudangvoucher: {
      qrisUrl: process.env.GV_QRIS_URL || 'https://devopenapi.gudangvoucher.com/v3/transaction/request/qris',
      storeUrl: process.env.GV_STORE_URL || 'https://devopenapi.gudangvoucher.com/v3/transaction/request/store',
      merchantId: process.env.GV_MERCHANT_ID || '',
      merchantKey: process.env.GV_MERCHANT_KEY || '',
    },
  },
  aws: {
    region: process.env.AWS_REGION || 'ap-southeast-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    s3: {
      bucketName: process.env.AWS_S3_BUCKET_NAME || '',
    },
  },
  db: {
    connection_string: process.env.DATABASE_URL || '',
  },
  node_env: process.env.NODE_ENV || 'development',
  mockEnabled: process.env.MOCK_ENABLED || false,
};

export const swaggerConfig = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Launcx Backend',
      version: '1.0.0',
    },
    servers: [
      {
        url: `${config.api.swaggerUrl}`,
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [
      {
        BearerAuth: [],
      },
    ],
  },
  apis: ['./src/route/*.ts'],
};
