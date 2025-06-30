import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { v4 as uuid } from 'uuid';
import crypto from 'crypto'
import axios from 'axios'
import HilogateClient from '../../service/hilogateClient'


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
export async function getDashboardTransactions(req: Request, res: Response) {
  try {
    // (1) parse tanggal & merchant filter
    const { date_from, date_to, merchantId } = req.query as any
    const dateFrom = date_from ? new Date(String(date_from)) : undefined
    const dateTo   = date_to   ? new Date(String(date_to))   : undefined
    const createdAtFilter: any = {}
    if (dateFrom && !isNaN(dateFrom.getTime())) createdAtFilter.gte = dateFrom
    if (dateTo   && !isNaN(dateTo.getTime()))   createdAtFilter.lte = dateTo

    // (2) build where untuk orders
    const whereOrders: any = {
      status: { in: ['SUCCESS', 'DONE', 'SETTLED', 'PENDING_SETTLEMENT'] },
      ...(dateFrom || dateTo ? { createdAt: createdAtFilter } : {}),
    }
    if (merchantId && merchantId !== 'all') {
      whereOrders.merchantId = merchantId
    }

    // (3) total pending (net sudah di pendingAmount)
    const pendingAgg = await prisma.order.aggregate({
      _sum: { pendingAmount: true },
      where: { ...whereOrders, status: 'PENDING_SETTLEMENT' }
    })
    const totalPending = pendingAgg._sum.pendingAmount ?? 0

    // (4) active balance via settlementAmount saja (net sudah di settlementAmount)
    const settleAgg = await prisma.order.aggregate({
      _sum: { settlementAmount: true },
      where: { ...whereOrders, status: { in: ['SUCCESS', 'DONE', 'SETTLED'] } }
    })
    const ordersActiveBalance = settleAgg._sum.settlementAmount ?? 0

    // (5) total merchant balance dari partnerClient.balance
    const pcWhere: any = {}
    if (merchantId && merchantId !== 'all') pcWhere.id = merchantId
    const merchants = await prisma.partnerClient.findMany({
      where: pcWhere,
      select: { balance: true }
    })
    const totalMerchantBalance = merchants
      .reduce((sum, m) => sum + m.balance, 0)

    // (6) ambil detail orders
    const orders = await prisma.order.findMany({
      where: whereOrders,
      orderBy: { createdAt: 'desc' },
      select: {
        id:               true,
        createdAt:        true,
        playerId:         true,
        qrPayload:        true,
        rrn:              true,
        amount:           true,
        feeLauncx:        true,
        fee3rdParty:      true,
        pendingAmount:    true,  // net untuk PENDING_SETTLEMENT
        settlementAmount: true,  // net untuk settled
        status:           true,  // PENDING_SETTLEMENT | SETTLED | etc.
      }
    })

    // (7) map ke format FE, include netSettle
    const transactions = orders.map(o => {
      const pend = o.pendingAmount ?? 0
      const sett = o.settlementAmount ?? 0
      const netSettle = o.status === 'PENDING_SETTLEMENT'
        ? pend
        : sett

      return {
        id:               o.id,
        date:             o.createdAt.toISOString(),
        reference:        o.qrPayload   ?? '',
        rrn:              o.rrn         ?? '',
        playerId:         o.playerId,
        amount:           o.amount,          // gross
        feeLauncx:        o.feeLauncx   ?? 0,
        feePg:            o.fee3rdParty ?? 0,
        netSettle,                            // langsung net
        status:           o.status === 'DONE' ? 'DONE' : 'SUCCESS',
        settlementStatus: o.status              // raw DB flag
      }
    })

    // (8) kembalikan JSON
    return res.json({
      transactions,
      totalPending,
      ordersActiveBalance,
      totalMerchantBalance
    })
  } catch (err: any) {
    console.error('[getDashboardTransactions]', err)
    return res.status(500).json({ error: 'Failed to fetch dashboard transactions' })
  }
}



export const getDashboardSummary = async (_req, res) => {
  try {
    // pakai helper public
    const result = await HilogateClient.getBalance()
    const {
      active_balance:   hilogateBalance = 0,
      pending_balance:  activeBalance   = 0,
      total_withdrawal,
      pending_withdrawal
    } = result.data

    return res.json({
      hilogateBalance,
      activeBalance,
      total_withdrawal,
      pending_withdrawal
    })
  } catch (err) {
    console.error('[getDashboardSummary]', err)
    return res.status(500).json({ error: 'Failed to fetch Hilogate balance' })
  }
}

export const getPlatformProfit = async (req: Request, res: Response) => {
  try {
    const { date_from, date_to, merchantId } = req.query as any;

    // 1. Filter status
    const where: any = { status: 'SETTLED' };

    // 2. Pakai createdAt sebagai filter tanggal
    if (date_from) {
      where.createdAt = { gte: new Date(date_from) };
    }
    if (date_to) {
      where.createdAt = {
        ...(where.createdAt || {}),
        lte: new Date(date_to)
      };
    }
    if (merchantId && merchantId !== 'all') {
      where.merchantId = merchantId;
    }

    // 3. Ambil feeLauncx & fee3rdParty
    const profitTxs = await prisma.order.findMany({
      where,
      select: { feeLauncx: true, fee3rdParty: true }
    });

    // 4. Hitung totalProfit
    const totalProfit = profitTxs.reduce((sum, t) => {
      return sum + ((t.feeLauncx ?? 0) - (t.fee3rdParty ?? 0));
    }, 0);

    return res.json({ totalProfit });
  } catch (err: any) {
    console.error('[getPlatformProfit]', err);
    return res.status(500).json({ error: err.message });
  }
};