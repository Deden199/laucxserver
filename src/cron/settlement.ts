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
  cron.schedule('* * * * *', async () => {
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

        // LOG RAW PAYLOAD
        logger.info(
          `[SettlementCron][RAW] order=${o.id} payload=${JSON.stringify(resp.data)}`
        )

        const tx = resp.data.data
        const settleSt = (tx.settlement_status ?? '').toUpperCase()
        const rrn      = tx.rrn ?? 'N/A'

        // Log RRN
        logger.info(`[SettlementCron] Order ${o.id} rrn = ${rrn}`)
        logger.info(`[SettlementCron] Order ${o.id} settlement_status = ${settleSt}`)

        if (['ACTIVE', 'SETTLED', 'COMPLETED'].includes(settleSt)) {
          const amt = o.pendingAmount ?? tx.net_amount

          // a) update balance partner
          await prisma.partnerClient.update({
            where: { id: o.merchantId! },
            data: { balance: { increment: amt } }
          })

          // b) tandai order settled & simpan rrn
          await prisma.order.update({
            where: { id: o.id },
            data: {
              status:           'SETTLED',
              settlementAmount: amt,
              pendingAmount:    null,
              rrn,                             // simpan rrn
              updatedAt:        new Date()
            }
          })

          logger.info(`[SettlementCron] Order ${o.id} settled (+${amt}), rrn=${rrn}`)
        } else {
          logger.info(
            `[SettlementCron] Order ${o.id} masih PENDING_SETTLEMENT (${settleSt}), rrn=${rrn}`
          )
        }
      } catch (err: any) {
        logger.error(`[SettlementCron] Gagal cek ${o.id}: ${err.message}`)
      }
    }

    logger.info('[SettlementCron] Selesai.')
  }, {
    timezone: 'Asia/Jakarta'
  })
}
