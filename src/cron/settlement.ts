import cron from 'node-cron'
import axios from 'axios'
import { prisma } from '../core/prisma'
import { config } from '../config'
import logger from '../logger'
import crypto from 'crypto'

function generateSignature(path: string, secretKey: string): string {
  return crypto
    .createHash('md5')
    .update(path + secretKey, 'utf8')
    .digest('hex')
}

export function scheduleSettlementChecker() {
  // Jalankan setiap hari jam 17:00 WIB
  cron.schedule(
    '0 17 * * *',
    async () => {
      logger.info('[SettlementCron] Mulai cek settlement…')

      const pendingOrders = await prisma.order.findMany({
        where: { status: 'PENDING_SETTLEMENT', merchantId: { not: null } },
        select: { id: true, merchantId: true, pendingAmount: true }
      })

      for (const o of pendingOrders) {
        try {
          const path = `/api/v1/transactions/${o.id}`
          const sig  = generateSignature(path, config.api.hilogate.secretKey)
          const resp = await axios.get(
            `${config.api.hilogate.baseUrl}${path}`,
            {
              headers: {
                'Content-Type': 'application/json',
                'X-Merchant-ID': config.api.hilogate.merchantId,
                'X-Signature': sig
              },
              timeout: 5_000
            }
          )

          const {
            net_amount,
            settlement_status // field dari API Hilogate
          } = resp.data.data

          const settleSt = settlement_status?.toUpperCase()

          if (['SETTLED', 'COMPLETED'].includes(settleSt)) {
            const amt = o.pendingAmount ?? net_amount

            // a) update balance partner
            await prisma.partnerClient.update({
              where: { id: o.merchantId! },
              data: { balance: { increment: amt } }
            })

            // b) tandai order settled
            await prisma.order.update({
              where: { id: o.id },
              data: {
                status:           'SETTLED',
                settlementAmount: amt,
                pendingAmount:    null,
                updatedAt:        new Date()
              }
            })

            logger.info(`[SettlementCron] Order ${o.id} benar-benar settled, +${amt}`)
          } else {
            logger.info(`[SettlementCron] Order ${o.id} masih PENDING_SETTLEMENT (${settleSt})`)
          }
        } catch (err: any) {
          logger.error(`[SettlementCron] Gagal cek ${o.id}: ${err.message}`)
        }
      }

      logger.info('[SettlementCron] Selesai.')
    },
    {
      timezone: 'Asia/Jakarta'
    }
  )
}
