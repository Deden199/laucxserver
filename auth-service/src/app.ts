import express from 'express'
import authRoutes from './route/auth.routes'
import clientRoutes from './route/client.routes'
import { config } from './config'

const app = express()
app.use(express.json())

app.use('/auth', authRoutes)
app.use('/client', clientRoutes)

if (require.main === module) {
  app.listen(config.api.port, () => {
    console.log(`Auth service listening on port ${config.api.port}`)
  })
}

export default app
