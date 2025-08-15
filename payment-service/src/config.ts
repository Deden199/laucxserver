import dotenv from 'dotenv'

dotenv.config()

const PORT = Number(process.env.PORT) || 5100
const nodeEnv = process.env.NODE_ENV || 'development'

export const config: any = {
  api: { port: PORT },
  nodeEnv
}
