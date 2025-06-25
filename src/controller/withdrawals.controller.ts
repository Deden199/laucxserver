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


const md5 = (s: string) => crypto.createHash('md5').update(s, 'utf8').digest('hex')

export const withdrawalCallback = async (req: Request, res: Response) => {
  try {
    /* 1. RAW BODY (fall-back ke stringify body kalau verify gagal) */
    let rawBody: string =
      (req as any).rawBody ??
      (req.body ? JSON.stringify(req.body) : '')
    if (!rawBody) {
      logger.error('[WD-CB] ❌ rawBody still empty – check capture middleware')
      return res.status(400).send('empty-body')
    }

    logger.info('[WD-CB] raw.len =', rawBody.length)
    logger.info('[WD-CB] preview  =', rawBody.slice(0, 250))

    /* 2. Hitung semua varian signature */
    const pathFull  = '/api/v1/withdrawals'
    const pathShort = '/withdrawals'
    const secret    = config.api.hilogate.secretKey
    const jsonTop   = JSON.stringify(JSON.parse(rawBody))

    const variants = {
      body_only     : md5(rawBody + secret),
      full_raw      : md5(pathFull  + rawBody + secret),
      short_raw     : md5(pathShort + rawBody + secret),
      full_jsonTop  : md5(pathFull  + jsonTop + secret),
      short_jsonTop : md5(pathShort + jsonTop + secret),
    }

    const got = req.get('X-Signature') || ''
    logger.info('[WD-CB] gotSig =', got)
    Object.entries(variants).forEach(([k, v]) => logger.info(`[WD-CB] ${k} =`, v))

    const matched = Object.entries(variants).find(([, v]) => v === got)?.[0]
    if (!matched) {
      logger.error('[WD-CB] ❌ Signature mismatch – no variant matched')
      return res.status(400).send('invalid-signature')
    }
    logger.info('[WD-CB] ✅ Signature matched with variant:', matched)

    /* 3. Parse field utama (top-level) */
    const {
      ref_id,
      status,
      net_amount,
      completed_at,
    } = JSON.parse(rawBody)

    if (!ref_id)            throw new Error('Missing ref_id')
    if (net_amount == null) throw new Error('Missing net_amount')

    /* 4. Ambil WithdrawRequest */
    const wr = await prisma.withdrawRequest.findUnique({
      where : { refId: ref_id },
      select: { amount: true, partnerClientId: true },
    })
    if (!wr) return res.status(404).send('withdraw-not-found')

    /* 5. Map status & update */
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

    /* 6. Rollback saldo jika gagal */
    if (newStatus === 'FAILED') {
      await prisma.partnerClient.update({
        where: { id: wr.partnerClientId },
        data : { balance: { increment: wr.amount } },
      })
    }

    logger.info('[WD-CB] Done OK for', ref_id)
    return res.status(200).json({ ok: true })
  } catch (err: any) {
    logger.error('[WD-CB] Error:', err)
    return res.status(400).json({ error: err.message })
  }
}