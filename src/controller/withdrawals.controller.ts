import { Request, Response } from 'express'
import { prisma } from '../core/prisma'
import { retryDisbursement } from '../service/hilogate.service'
import crypto from 'crypto'
import { config } from '../config'
import logger from '../logger'
import { DisbursementStatus } from '@prisma/client'

export async function listWithdrawals(req: Request, res: Response) {
  const clientId = (req as any).client.id as string;
  const { status, date_from, date_to, page = '1', limit = '20' } = req.query;

  const where: any = { partnerClientId: clientId };
  if (status)       where.status = status as string;
  if (date_from || date_to) {
    where.createdAt = {};
    if (date_from) where.createdAt.gte = new Date(date_from as string);
    if (date_to)   where.createdAt.lte = new Date(date_to as string);
  }

  const pageNum  = Math.max(1, parseInt(page as string, 10));
  const pageSize = Math.min(100, parseInt(limit as string, 10));

  // ambil fields penting termasuk bankName & accountNumber
  const [rows, total] = await Promise.all([
    prisma.withdrawRequest.findMany({
      where,
      skip:  (pageNum - 1) * pageSize,
      take:  pageSize,
      orderBy: { createdAt: 'desc' },
      select: {
        refId:          true,
        bankName:       true,
        accountNumber:  true,
        amount:         true,
        status:         true,
        createdAt:      true,
        completedAt:    true,
      },
    }),
    prisma.withdrawRequest.count({ where }),
  ]);

  const data = rows.map(w => ({
    refId:         w.refId,
    bankName:      w.bankName,
    accountNumber: w.accountNumber,
    amount:        w.amount,
    status:        w.status,
    date:          w.createdAt.toISOString(),          // jika UI pakai field date
    createdAt:     w.createdAt.toISOString(),          // atau tetap createdAt
    completedAt:   w.completedAt ? w.completedAt.toISOString() : null,
  }));

  return res.json({ data, total });
}

// POST /api/v1/withdrawals/:id/retry
export async function retryWithdrawal(req: Request, res: Response) {
  const clientId = (req as any).client.id as string
  const { id }   = req.params

  // Ownership check
  const wr = await prisma.withdrawRequest.findUnique({
    where: { refId: id },
    select: { refId: true, status: true, partnerClientId: true }
  })
  if (!wr || wr.partnerClientId !== clientId) {
    return res.status(403).json({ error: 'Access denied' })
  }

  // Status guard
  if (['SUCCESS', 'PROCESSING'].includes(wr.status)) {
    return res
      .status(400)
      .json({ error: `Tidak dapat retry untuk status ${wr.status}` })
  }

  // Retry process
  try {
    const result = await retryDisbursement(wr.refId)
    return res.json({ success: true, result })
  } catch (err: any) {
    console.error('Retry withdrawal error:', err)
    return res
      .status(500)
      .json({ error: 'Gagal melakukan retry. Silakan coba lagi nanti.' })
  }
}

async function retry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  let lastError: any
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (e: any) {
      lastError = e
      if (e.message?.includes('write conflict') || e.code === 'P2034') {
        await new Promise(r => setTimeout(r, 50 * (i + 1)))
        continue
      }
      throw e
    }
  }
  throw lastError
}

export const withdrawalCallback = async (req: Request, res: Response) => {
  try {
    // 1) Ambil & parse raw body
    // @ts-ignore
    const raw = (req.rawBody as Buffer).toString('utf8')
    const full = JSON.parse(raw) as any

    // 2) Verifikasi signature
    const gotSig = (req.header('X-Signature') || '').trim()
    if (gotSig !== full.merchant_signature) {
      return res.status(400).json({ error: 'Invalid signature' })
    }

    // 3) Ambil payload
    const data = full.data ?? full
    const { ref_id, status, net_amount, completed_at } = data
    if (!ref_id || net_amount == null) {
      return res.status(400).json({ error: 'Invalid payload' })
    }

    // 4) Fetch record awal untuk cek refund
    const wr = await prisma.withdrawRequest.findUnique({
      where: { refId: ref_id },
      select: { amount: true, partnerClientId: true, status: true }
    })
    if (!wr) return res.status(404).send('Not found')

    // 5) Tentukan newStatus
    const up = status.toUpperCase()
    const newStatus: DisbursementStatus =
      up === 'COMPLETED' || up === 'SUCCESS'
        ? DisbursementStatus.COMPLETED
        : up === 'FAILED' || up === 'ERROR'
          ? DisbursementStatus.FAILED
          : DisbursementStatus.PENDING

    // 6) Idempotent update + retry
    const { count } = await retry(() =>
      prisma.withdrawRequest.updateMany({
        where: { refId: ref_id, status: DisbursementStatus.PENDING },
        data: {
          status:      newStatus,
          netAmount:   net_amount,
          completedAt: completed_at ? new Date(completed_at) : undefined,
        },
      })
    )

    // 7) Jika gagal & memang pertama kali gagal, refund
    if (count > 0 && newStatus === DisbursementStatus.FAILED) {
      await retry(() =>
        prisma.partnerClient.update({
          where: { id: wr.partnerClientId },
          data: { balance: { increment: wr.amount } },
        })
      )
    }

    return res.status(200).json({ message: 'OK' })
  } catch (err: any) {
    console.error('[withdrawalCallback] error:', err)
    return res.status(500).json({ error: err.message })
  }
}