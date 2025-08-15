import dotenv from 'dotenv'

dotenv.config()

const PORT = Number(process.env.PORT) || 5000
const jwtSecret = process.env.JWT_SECRET || 'secret'

export const config = {
  api: {
    port: PORT,
    jwtSecret
  }
}
