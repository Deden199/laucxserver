import dotenv from 'dotenv'

dotenv.config()

const PORT = Number(process.env.PORT) || 5200
const jwtSecret = process.env.JWT_SECRET || 'secret'

export const config = {
  api: {
    port: PORT,
    jwtSecret,
    hilogate: {
      merchantId: process.env.HILOGATE_MERCHANT_ID || '',
      secretKey: process.env.HILOGATE_SECRET_KEY || '',
      env: process.env.HILOGATE_ENV || 'sandbox',
      baseUrl: process.env.HILOGATE_BASE_URL || 'https://app.hilogate.com',
    },
    oy: {
      apiKey: process.env.OY_API_KEY || '',
      username: process.env.OY_USERNAME || '',
      baseUrl:
        process.env.OY_BASE_URL ||
        (process.env.NODE_ENV === 'production'
          ? 'https://partner.oyindonesia.com'
          : 'https://api-stg.oyindonesia.com'),
      endpoints: {
        ewallet: '/api/e-wallet-aggregator',
        qris: '/api/payment-routing',
        remit: '/api/remit',
      },
    },
  },
  nodeEnv: process.env.NODE_ENV || 'development',
}
