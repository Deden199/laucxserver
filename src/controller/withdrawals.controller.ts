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


/* helper */
const md5 = (s: string) =>
  crypto.createHash('md5').update(s, 'utf8').digest('hex')

export const withdrawalCallback = async (req: Request, res: Response) => {
  let rawBody = ''

  try {
    /* ─────────────── 1) RAW BODY ─────────────── */
    rawBody = (req as any).rawBody?.toString('utf8') ?? ''
    logger.info('[WD-CB] raw len  :', rawBody.length)
    logger.info('[WD-CB] raw first:', rawBody.slice(0, 300))

    /* ─────────────── 2) HITUNG SEMUA HASH ─────────────── */
    const pathFull   = '/api/v1/withdrawals'
    const pathShort  = '/withdrawals'
    const secret     = config.api.hilogate.secretKey
    const gotSig     = req.get('X-Signature') || req.get('x-signature') || ''

    // payload top-level (karena withdrawal tidak punya field data)
    const jsonTop = JSON.stringify(JSON.parse(rawBody))

    const hashes = {
      body_only     : md5(rawBody                       + secret),       // dokumen resmi
      full_raw      : md5(pathFull   + rawBody          + secret),       // /api/v1 + RAW
      short_raw     : md5(pathShort  + rawBody          + secret),       // /withdrawals + RAW
      full_jsonTop  : md5(pathFull   + jsonTop          + secret),       // /api/v1 + JSON.stringify
      short_jsonTop : md5(pathShort  + jsonTop          + secret),       // /withdrawals + stringify
    }

    logger.info('[WD-CB] gotSig      =', gotSig)
    Object.entries(hashes).forEach(([k, v]) =>
      logger.info(`[WD-CB] ${k.padEnd(13)}=`, v),
    )

    /* ─────────────── 3) VALIDASI SIG ─────────────── */
    const matchKey = Object.entries(hashes).find(([, v]) => v === gotSig)?.[0]
    if (!matchKey) {
      logger.error('[WD-CB] ❌ Signature mismatch – none matched')
      return res.status(400).send('invalid-signature')
    }
    logger.info('[WD-CB] ✅ Signature matched using:', matchKey)

    /* ─────────────── 4) PARSE PAYLOAD ─────────────── */
    // Withdrawal payload ada di top-level
    const {
      ref_id,
      status,
      net_amount,
      completed_at,
    } = JSON.parse(rawBody) as any

    if (!ref_id)            throw new Error('Missing ref_id')
    if (net_amount == null) throw new Error('Missing net_amount')

    /* ─────────────── 5) CARI WITHDRAW DI DB ─────────────── */
    const wr = await prisma.withdrawRequest.findUnique({
      where : { refId: ref_id },
      select: { amount: true, partnerClientId: true },
    })
    if (!wr) {
      logger.error('[WD-CB] WithdrawRequest not found:', ref_id)
      return res.status(404).send('not-found')
    }

    /* ─────────────── 6) UPDATE STATUS ─────────────── */
    const up = String(status).toUpperCase()
    const newStatus: DisbursementStatus =
      ['FAILED', 'ERROR'].includes(up)      ? 'FAILED'     :
      ['COMPLETED', 'SUCCESS'].includes(up) ? 'COMPLETED'  :
                                              'PENDING'

    await prisma.withdrawRequest.update({
      where: { refId: ref_id },
      data : {
        status     : newStatus,
        netAmount  : net_amount,
        completedAt: completed_at ? new Date(completed_at) : undefined,
      },
    })

    /* ─────────────── 7) ROLLBACK SALDO JIKA GAGAL ─────────────── */
    if (newStatus === 'FAILED') {
      await prisma.partnerClient.update({
        where: { id: wr.partnerClientId },
        data : { balance: { increment: wr.amount } },
      })
    }

    /* ─────────────── 8) DONE ─────────────── */
    logger.info('[WD-CB] Finished OK:', ref_id)
    return res.status(200).json({ message: 'OK' })

  } catch (err: any) {
    logger.error('[WD-CB] Error:', err)
    return res.status(400).json({ error: err.message })
  }
}