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


const md5 = (s: string) =>
  crypto.createHash('md5').update(s, 'utf8').digest('hex');

export const withdrawalCallback = async (req: Request, res: Response) => {
  try {
    /* 1 ▸ body & signature */
    const raw = (req as any).rawBody as string;
    if (!raw) return res.status(400).send('empty-body');

    const got = req.get('X-Signature') || '';
    const expected = md5(raw + config.api.hilogate.secretKey);   // BODY + SECRET

    if (got !== expected) {
      logger.error('[WD-CB] signature mismatch');
      return res.status(400).send('invalid-signature');
    }

    /* 2 ▸ parse payload (top-level) */
    const {
      ref_id,
      status,
      net_amount,
      completed_at,
    } = JSON.parse(raw);

    if (!ref_id || net_amount == null)
      return res.status(422).send('missing-fields');

    /* 3 ▸ fetch request */
    const wr = await prisma.withdrawRequest.findUnique({
      where : { refId: ref_id },
      select: { amount: true, partnerClientId: true },
    });
    if (!wr) return res.status(404).send('withdraw-not-found');

    /* 4 ▸ map status */
    const up = String(status).toUpperCase();
    const newStatus: DisbursementStatus =
      ['FAILED', 'ERROR'].includes(up)      ? 'FAILED' :
      ['COMPLETED', 'SUCCESS'].includes(up) ? 'COMPLETED' :
                                              'PENDING';

    /* 5 ▸ update DB */
    await prisma.withdrawRequest.update({
      where: { refId: ref_id },
      data : {
        status     : newStatus,
        netAmount  : net_amount,
        completedAt: completed_at ? new Date(completed_at) : undefined,
      },
    });

    /* 6 ▸ rollback saldo jika gagal */
    if (newStatus === 'FAILED') {
      await prisma.partnerClient.update({
        where: { id: wr.partnerClientId },
        data : { balance: { increment: wr.amount } },
      });
    }

    return res.json({ ok: true });
  } catch (err: any) {
    logger.error('[WD-CB] error:', err);
    return res.status(500).json({ error: err.message });
  }
};