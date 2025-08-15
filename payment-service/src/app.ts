import express from 'express'
import paymentRoutes from './route/payment.routes'
import transactionsRoutes from './route/transactions.routes'
import { config } from './config'

const app = express()
app.use(express.json())

app.use('/payment', paymentRoutes)
app.use('/transactions', transactionsRoutes)

if (require.main === module) {
  app.listen(config.api.port, () => {
    console.log(`Payment service listening on port ${config.api.port}`)
  })
}

export default app
