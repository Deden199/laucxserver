import { Request, Response } from 'express'
import { prisma } from '../core/prisma'
import { retryDisbursement } from '../service/hilogate.service'
import crypto from 'crypto'
import { config } from '../config'
import logger from '../logger'
import { DisbursementStatus } from '@prisma/client'

// List withdrawal requests (WithdrawRequest)
export async function listWithdrawals(req: Request, res: Response) {
  const { status, date_from, date_to, page = 1, limit = 20 } = req.query
  const where: any = {}
  if (status) where.status = status as string
  if (date_from || date_to) {
    where.createdAt = {}
    if (date_from) where.createdAt.gte = new Date(date_from as string)
    if (date_to)   where.createdAt.lte = new Date(date_to as string)
  }
  const pageNum = Number(page)
  const pageSize = Number(limit)

  const data = await prisma.withdrawRequest.findMany({
    where,
    skip: (pageNum - 1) * pageSize,
    take: pageSize,
    orderBy: { createdAt: 'desc' },
  })
  const total = await prisma.withdrawRequest.count({ where })
  res.json({ data, total })
}

// Retry a failed withdrawal by invoking Hilogate resend-callback
export async function retryWithdrawal(req: Request, res: Response) {
  const { id } = req.params
  try {
    const result = await retryDisbursement(id)
    res.json({ success: true, result })
  } catch (err: any) {
    res.status(500).json({ message: err.message })
  }
}

// Callback handler for Hilogate withdrawal status updates
export const withdrawalCallback = async (req: Request, res: Response) => {
  let rawBody: string
  try {
    // 1) Baca rawBody & log
    rawBody = (req as any).rawBody.toString('utf8')
    logger.debug('[Withdraw Callback] rawBody:', rawBody)

    // 2) Verifikasi signature Hilogate:
    //    formula: MD5(request_body + secretKey)
    const expectedSig = crypto
      .createHash('md5')
      .update(rawBody + config.api.hilogate.secretKey, 'utf8')
      .digest('hex')
    const gotSig = req.header('X-Signature') || req.header('x-signature') || ''
    logger.debug(`[Withdraw Callback] gotSig=${gotSig} expected=${expectedSig}`)
    if (gotSig !== expectedSig) {
      logger.error('[Withdraw Callback] Invalid signature')
      return res.status(400).send('Invalid signature')
    }

    // 3) Parse payload
    const full = JSON.parse(rawBody) as any
    const { ref_id, status, net_amount, completed_at } = full.data || {}

    if (!ref_id)      throw new Error('Missing ref_id')
    if (net_amount == null) throw new Error('Missing net_amount')

    // 4) Ambil record WithdrawRequest beserta partnerClientId & amount
    const wr = await prisma.withdrawRequest.findUnique({
      where: { refId: ref_id },
      select: { amount: true, partnerClientId: true }
    })
    if (!wr) {
      logger.error(`[Withdraw Callback] WithdrawRequest ${ref_id} not found`)
      return res.status(404).send('Not found')
    }

    // 5) Map status provider ke enum internal
    const upStatus = (status as string).toUpperCase()
    let newStatus: DisbursementStatus
    switch (upStatus) {
      case 'FAILED':
      case 'ERROR':
        newStatus = DisbursementStatus.FAILED
        break
      case 'COMPLETED':
      case 'SUCCESS':
        newStatus = DisbursementStatus.COMPLETED
        break
      default:
        // e.g. WAITING, PENDING, etc → PENDING
        newStatus = DisbursementStatus.PENDING
    }

    // 6) Update WithdrawRequest
    await prisma.withdrawRequest.update({
      where: { refId: ref_id },
      data: {
        status:     newStatus,
        netAmount:  net_amount,
        completedAt: completed_at ? new Date(completed_at) : undefined,
      },
    })

    // 7) Jika gagal, kembalikan saldo partner
    if (newStatus === DisbursementStatus.FAILED) {
      await prisma.partnerClient.update({
        where: { id: wr.partnerClientId },
        data: { balance: { increment: wr.amount } },
      })
    }

    // 8) Kirim sukses ke Hilogate
    return res.status(200).json({ message: 'OK' })
  } catch (err: any) {
    logger.error('[Withdraw Callback] Error:', err)
    return res.status(400).json({ error: err.message })
  }
}