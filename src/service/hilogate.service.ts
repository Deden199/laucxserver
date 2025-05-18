import { prisma } from '../core/prisma'
import hilogateClient from '../service/hilogateClient'

export async function syncWithHilogate(refId: string) {
  // gunakan method publik, bukan .request
  const response = await hilogateClient.getTransaction(refId)
  const { ref_id, status, settlement_amount, settlement_at } = response

  return prisma.transaction_request.update({
    where: { id: ref_id },
    data: {
      status,
      settlementAmount: settlement_amount ?? undefined,
      settlementAt: settlement_at ? new Date(settlement_at) : undefined,
    },
  })
}

export async function retryDisbursement(disbursementId: string) {
  const disb = await prisma.disbursement.findUnique({ where: { id: disbursementId } })
  if (!disb) throw new Error('Disbursement not found')

  const payload = {
    ref_id: disb.id,
    amount: Number(disb.amount),
    beneficiary: {
      account_number: disb.beneficiary.accountNumber,
      account_name:   disb.beneficiary.accountName,
      bank_code:      disb.beneficiary.bankCode,
    },
  }

  // gunakan method publik
  const result = await hilogateClient.initiateDisbursement(payload)

  return prisma.disbursement.update({
    where: { id: disbursementId },
    data: {
      status:      result.status,
      totalAmount: BigInt(result.total_amount ?? disb.totalAmount),
      transferFee: BigInt(result.transfer_fee  ?? disb.transferFee),
    },
  })
}
