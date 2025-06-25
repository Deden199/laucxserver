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


export const withdrawalCallback = async (req: Request, res: Response) => {
  let rawBody = ''

  try {
    /* ── 1) RAW BODY ─────────────────────────────────────────────────────── */
    rawBody = (req as any).rawBody?.toString('utf8') ?? ''
    logger.debug('[WD-CB] rawBody length:', rawBody.length)
    logger.debug('[WD-CB] rawBody preview:', rawBody.slice(0, 300))

    /* ── 2) SIGNATURE CALC / COMPARE ─────────────────────────────────────── */
    const requestPath = '/api/v1/withdrawals'            // pastikan ini FIX
    const minimalPayload = JSON.stringify(JSON.parse(rawBody).data)

    // string-to-sign versi "3 part"
    const stringToSign = requestPath + minimalPayload + '[SECRET_KEY]'
    logger.debug('[WD-CB] stringToSign (masked):', stringToSign)

    const expectedSig = crypto
      .createHash('md5')
      .update(requestPath + minimalPayload + config.api.hilogate.secretKey, 'utf8')
      .digest('hex')

    // tambah juga versi "body+secret" sesuai doc, biar bisa banding
    const expectedDoc = crypto
      .createHash('md5')
      .update(rawBody + config.api.hilogate.secretKey, 'utf8')
      .digest('hex')

    const gotSig = req.get('X-Signature') || req.get('x-signature') || ''
    logger.debug('[WD-CB] gotSig      =', gotSig)
    logger.debug('[WD-CB] expectedSig =', expectedSig, '(PATH+payload)')
    logger.debug('[WD-CB] expectedDoc =', expectedDoc, '(RAW+secret)')
    logger.debug('[WD-CB] path        =', req.originalUrl)

    if (gotSig !== expectedSig) {
      logger.error('[WD-CB] Signature mismatch (PATH+payload)')
      return res.status(400).send('invalid-signature')
    }

    /* ── 3) PARSE FIELD-UTAMA ───────────────────────────────────────────── */
    const { ref_id, status, net_amount, completed_at } = JSON.parse(rawBody).data ?? {}
    if (!ref_id)                 throw new Error('Missing ref_id')
    if (net_amount == null)      throw new Error('Missing net_amount')

    /* ── 4) AMBIL DATA WITHDRAW DI DB ───────────────────────────────────── */
    const wr = await prisma.withdrawRequest.findUnique({
      where:  { refId: ref_id },
      select: { amount: true, partnerClientId: true }
    })
    if (!wr) {
      logger.error('[WD-CB] WithdrawRequest not found:', ref_id)
      return res.status(404).send('not-found')
    }

    /* ── 5-6) HITUNG STATUS & UPDATE ────────────────────────────────────── */
    const up = String(status).toUpperCase()
    const newStatus =
      ['FAILED', 'ERROR'].includes(up)     ? DisbursementStatus.FAILED     :
      ['COMPLETED', 'SUCCESS'].includes(up)? DisbursementStatus.COMPLETED  :
                                            DisbursementStatus.PENDING

    await prisma.withdrawRequest.update({
      where: { refId: ref_id },
      data : {
        status     : newStatus,
        netAmount  : net_amount,
        completedAt: completed_at ? new Date(completed_at) : undefined,
      }
    })

    /* ── 7) ROLLBACK SALDO JIKA GAGAL ───────────────────────────────────── */
    if (newStatus === DisbursementStatus.FAILED) {
      await prisma.partnerClient.update({
        where: { id: wr.partnerClientId },
        data : { balance: { increment: wr.amount } },
      })
    }

    /* ── 8) DONE ─────────────────────────────────────────────────────────── */
    return res.status(200).json({ message: 'OK' })

  } catch (err: any) {
    logger.error('[WD-CB] Error:', err)
    return res.status(400).json({ error: err.message })
  }
}