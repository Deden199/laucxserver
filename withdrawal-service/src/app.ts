import express from 'express'
import withdrawalRoutes from './route/withdrawals.routes'
import { config } from './config'

const app = express()
app.use(express.json())

app.use('/withdrawals', withdrawalRoutes)

if (require.main === module) {
  app.listen(config.api.port, () => {
    console.log(`Withdrawal service listening on port ${config.api.port}`)
  })
}

export default app
