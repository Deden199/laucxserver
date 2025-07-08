import { prisma } from '../core/prisma'
import { OyClient, OyConfig } from './oyClient'
import { getActiveProviders } from './provider'
import { DisbursementStatus } from '@prisma/client'

export async function retryDisbursementOY(refId: string, merchantId: string) {
  const wr = await prisma.withdrawRequest.findUnique({ where: { refId } })
  if (!wr) throw new Error('WithdrawRequest not found')

  const providers = await getActiveProviders(merchantId, 'oy')
  if (!providers.length) throw new Error('No active OY credentials')

  const cfg = providers[0].config as OyConfig
  const client = new OyClient(cfg)

  const payload = {
    recipient_bank:    wr.bankCode,
    recipient_account: wr.accountNumber,
    amount:            wr.amount,
    note:              `Retry withdrawal ${wr.refId}`,
    partner_trx_id:    wr.refId,
    email:             wr.accountName
  }

  const result = await client.disburse(payload)
  const statusResp = await client.checkDisbursementStatus(wr.refId, false)
  const code = statusResp?.status?.code

  const newStatus =
    code === '101'
      ? DisbursementStatus.PENDING
      : code === '000'
        ? DisbursementStatus.COMPLETED
        : DisbursementStatus.FAILED

  const completedAt = statusResp.completed_at
    ? new Date(statusResp.completed_at)
    : undefined
  const netAmt = statusResp.net_amount ?? wr.netAmount

  const updated = await prisma.withdrawRequest.update({
    where: { refId },
    data: {
      paymentGatewayId:  result.trx_id || result.trxId,
      isTransferProcess: true,
      status:            newStatus,
      netAmount:         netAmt,
      completedAt
    }
  })

  if (newStatus === DisbursementStatus.FAILED && wr.status !== DisbursementStatus.FAILED) {
    await prisma.partnerClient.update({
      where: { id: wr.partnerClientId },
      data: { balance: { increment: wr.amount } }
    })
  }

  return updated
}