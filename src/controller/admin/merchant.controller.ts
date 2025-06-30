import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { v4 as uuid } from 'uuid';

const prisma = new PrismaClient();

// 1. Create merchant (mdr wajib)
export const createMerchant = async (req: Request, res: Response) => {
  const { name, phoneNumber, email, telegram, mdr } = req.body;
  if (mdr == null) {
    return res.status(400).json({ error: 'mdr required' });
  }
  const merchant = await prisma.merchant.create({
    data: {
      name,
      phoneNumber,
      email,
      telegram,
      mdr: Number(mdr),
    },
  });
  res.status(201).json(merchant);
};

// 2. List semua merchant
export const getAllMerchants = async (_req: Request, res: Response) => {
  const list = await prisma.merchant.findMany();
  res.json(list);
};

// 3. Get merchant by ID
export const getMerchantById = async (req: Request, res: Response) => {
  const { id } = req.params;
  const merchant = await prisma.merchant.findUnique({ where: { id } });
  if (!merchant) {
    return res.status(404).json({ error: 'Merchant not found' });
  }
  res.json(merchant);
};

// 4. Update merchant (boleh ubah semua field termasuk mdr)
export const updateMerchant = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { mdr, ...rest } = req.body;
  const data: any = { ...rest };
  if (mdr != null) {
    data.mdr = Number(mdr);
  }
  const updated = await prisma.merchant.update({ where: { id }, data });
  res.json(updated);
};

// 5. Delete merchant
export const deleteMerchant = async (req: Request, res: Response) => {
  const { id } = req.params;
  await prisma.merchant.delete({ where: { id } });
  res.status(204).end();
};

// 6. Set fee rate (mdr) khusus
export const setFeeRate = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { mdr } = req.body;
  if (mdr == null) {
    return res.status(400).json({ error: 'mdr required' });
  }
  const merchant = await prisma.merchant.update({
    where: { id },
    data: { mdr: Number(mdr) },
  });
  res.json(merchant);
};

// 7. Connect PG (sub_merchant dengan fee)
export const connectPG = async (req: Request, res: Response) => {
  const merchantId = req.params.id;
  const { netzMerchantId, netzPartnerId, fee } = req.body;
  if (!netzMerchantId || !netzPartnerId) {
    return res
      .status(400)
      .json({ error: 'netzMerchantId & netzPartnerId required' });
  }
  const relation = await prisma.sub_merchant.create({
    data: {
      merchantId,
      netzMerchantId,
      netzPartnerId,
      fee: fee != null ? Number(fee) : 0.0,
    },
  });
  res.status(201).json(relation);
};

// 8. List koneksi PG untuk satu merchant
export const listPGs = async (req: Request, res: Response) => {
  const merchantId = req.params.id;
  const list = await prisma.sub_merchant.findMany({
    where: { merchantId },
  });
  res.json(list);
};

// 9. Update fee koneksi PG
export const updatePGFee = async (req: Request, res: Response) => {
  const subId = req.params.subId;
  const { fee } = req.body;
  if (fee == null) {
    return res.status(400).json({ error: 'fee required' });
  }
  const updated = await prisma.sub_merchant.update({
    where: { id: subId },
    data: { fee: Number(fee) },
  });
  res.json(updated);
};

// 10. Disconnect PG
export const disconnectPG = async (req: Request, res: Response) => {
  const subId = req.params.subId;
  await prisma.sub_merchant.delete({ where: { id: subId } });
  res.status(204).end();
};

// 11. Regenerate API key untuk partnerClient
export const regenerateApiKey = async (_req: Request, res: Response) => {
  const apiKey = uuid();
  const apiSecret = uuid();
  const client = await prisma.partnerClient.create({
    data: {
      name: `Client-${apiKey}`,
      apiKey,
      apiSecret,
      isActive: true,
    },
  });
  res.json({ apiKey: client.apiKey, apiSecret: client.apiSecret });
};
// src/controller/admin/merchant.controller.ts

export const getDashboardTransactions = async (req: Request, res: Response) => {
  try {
    const { date_from, date_to, merchantId } = req.query as {
      date_from: string
      date_to?: string
      merchantId?: string
    }

    // parse tanggal
    const dateFrom = new Date(date_from)
    const dateTo   = date_to ? new Date(date_to) : undefined
    const createdAt: any = {}
    if (dateFrom) createdAt.gte = dateFrom
    if (dateTo)   createdAt.lte = dateTo

    // build where clause: hanya status sukses
    const where: any = {
      createdAt,
      status: { in: ['SUCCESS', 'DONE', 'SETTLED','PENDING_SETTLEMENT'] },
      ...(merchantId && merchantId !== 'all' ? { merchantId } : {})
    }

    const orders = await prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        userId: true,
        rrn: true,
        amount: true,
        feeLauncx: true,
        fee3rdParty: true,
        settlementAmount: true,
        status: true,
      }
    })

    const payload = orders.map(o => {
      const feeL    = o.feeLauncx ?? 0
      const feeP    = o.fee3rdParty ?? 0
      const netSettle = (o.settlementAmount ?? 0) - feeL

      return {
        id:        o.id,
        createdAt: o.createdAt,
        buyerId:   o.userId,
        reference: o.rrn,
        amount:    o.amount ?? 0,
        feeLauncx: feeL,
        feePg:     feeP,
        netProfit: feeL - feeP,
        netSettle,
        status:    o.status,
      }
    })

    res.json(payload)
  } catch (err: any) {
    console.error('[getDashboardTransactions]', err)
    res.status(500).json({ error: 'Failed to fetch dashboard transactions' })
  }
}

/**
 * 13. GET /merchant/dashboard/summary
 *     Hitung balance Hilogate & active balance
 */
export const getDashboardSummary = async (req: Request, res: Response) => {
  try {
    const { date_from, date_to, merchantId } = req.query as {
      date_from: string
      date_to?: string
      merchantId?: string
    }

    // parse tanggal & where clause seperti biasa…
    const dateFrom = new Date(date_from)
    const dateTo   = date_to ? new Date(date_to) : undefined
    const createdAt: any = {}
    if (dateFrom) createdAt.gte = dateFrom
    if (dateTo)   createdAt.lte = dateTo

    const baseWhere: any = {
      createdAt,
      ...(merchantId && merchantId!=='all' ? { merchantId } : {})
    }

    // total pending (gross)
    const pendAgg = await prisma.order.aggregate({
      _sum: { pendingAmount: true },
      where: { ...baseWhere, status: 'PENDING_SETTLEMENT' }
    })
    const totalPending = pendAgg._sum.pendingAmount ?? 0

    // total settled (net)
    const settleAgg = await prisma.order.aggregate({
      _sum: { settlementAmount: true },
      where: { ...baseWhere, status: { in: ['SUCCESS','DONE','SETTLED'] } }
    })
    const totalSettled = settleAgg._sum.settlementAmount ?? 0

    // total fee PG (sum fee3rdParty)
    const feeAgg = await prisma.order.aggregate({
      _sum: { fee3rdParty: true },
      where: { ...baseWhere, status: { in: ['SUCCESS','DONE','SETTLED'] } }
    })
    const totalFeePg = feeAgg._sum.fee3rdParty ?? 0

    // total netProfit (sum feeLauncx – fee3rdParty)
    const profitAgg = await prisma.order.findMany({
      where: { ...baseWhere, status: { in: ['SUCCESS','DONE','SETTLED'] } },
      select: { feeLauncx: true, fee3rdParty: true }
    })
    const totalNetProfit = profitAgg
      .reduce((sum, o) => sum + ((o.feeLauncx ?? 0) - (o.fee3rdParty ?? 0)), 0)

    // count transaksi sukses
    const totalTrans = await prisma.order.count({
      where: { ...baseWhere, status: { in: ['SUCCESS','DONE','SETTLED'] } }
    })

    // hilogateBalance & activeBalance tetap seperti sebelumnya
    const hilogateAgg = await prisma.order.aggregate({
      _sum: { settlementAmount: true },
      where: { ...baseWhere, status: { in: ['SUCCESS','DONE','SETTLED'] } }
    })
    const activeAgg = await prisma.order.aggregate({
      _sum: { pendingAmount: true },
      where: { ...baseWhere, status: 'PENDING_SETTLEMENT' }
    })
    const hilogateBalance = hilogateAgg._sum.settlementAmount ?? 0
    const activeBalance   = activeAgg._sum.pendingAmount   ?? 0

    return res.json({
      hilogateBalance,
      activeBalance,
      totalPending,
      totalSettled,
      totalFeePg,
      totalNetProfit,
      totalTrans,
    })
  } catch (err: any) {
    console.error('[getDashboardSummary]', err)
    res.status(500).json({ error: 'Failed to fetch dashboard summary' })
  }
}
