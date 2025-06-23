import cron from 'node-cron'
import axios from 'axios'
import { prisma } from '../core/prisma'
import { config } from '../config'
import logger from '../logger'
import crypto from 'crypto'

/**
 * Buat signature untuk GET:
 * MD5(path + secretKey)
 */
function generateSignature(path: string, secretKey: string): string {
  return crypto
    .createHash('md5')
    .update(path + secretKey, 'utf8')
    .digest('hex')
}

export function scheduleSettlementChecker() {
  cron.schedule(
    '0 17 * * *',
    async () => {
      logger.info('[SettlementCron] Mulai cek settlement…')

      // 1) ambil semua pending
      const pendingOrders = await prisma.order.findMany({
        where: { status: 'PENDING_SETTLEMENT' },
        select: { id: true, merchantId: true, pendingAmount: true }
      })

      for (const o of pendingOrders) {
        try {
          // 2) panggil Transaction Detail API
          const path    = `/api/v1/transactions/${o.id}`
          const sig     = generateSignature(path, config.api.hilogate.secretKey)
          const resp    = await axios.get(
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

          const { status, net_amount, completed_at } = resp.data.data

          // 3) jika sudah success/done dan ada completed_at
          if (['SUCCESS', 'DONE'].includes(status.toUpperCase()) && completed_at) {
            const amt = o.pendingAmount ?? net_amount

            // a) tambah ke partnerClient.balance
            await prisma.partnerClient.update({
              where: { id: o.merchantId },
              data: { balance: { increment: amt } }
            })

            // b) update order
            await prisma.order.update({
              where: { id: o.id },
              data: {
                status:           'SETTLED',
                settlementAmount: amt,
                pendingAmount:    null,
                updatedAt:        new Date()
              }
            })

            logger.info(`[SettlementCron] Order ${o.id} settled, +${amt}`)
          } else {
            logger.info(`[SettlementCron] Order ${o.id} masih pending settlement`)
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
