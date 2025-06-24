import { Response } from 'express'
import { prisma } from '../core/prisma'
import hilogateClient from '../service/hilogateClient'
import { ClientAuthRequest } from '../middleware/clientAuth'
import ExcelJS from 'exceljs'

/**
 * GET /api/v1/client/dashboard
 * – balance
 * – totalPending (semua PENDING_SETTLEMENT)
 * – daftar transaksi dengan status SUCCESS, DONE, SETTLED
 */
export async function getClientDashboard(req: ClientAuthRequest, res: Response) {
  // 1) Ambil user & partnerClient
  const user = await prisma.clientUser.findUnique({
    where: { id: req.clientUserId! },
    include: { partnerClient: true }
  })
  if (!user) return res.status(404).json({ error: 'User tidak ditemukan' })
  const pc = user.partnerClient

  // 2) Parse filter tanggal opsional
  const dateFrom = req.query.date_from ? new Date(String(req.query.date_from)) : undefined
  const dateTo   = req.query.date_to   ? new Date(String(req.query.date_to))   : undefined
  const createdAtFilter: any = {}
  if (dateFrom) createdAtFilter.gte = dateFrom
  if (dateTo)   createdAtFilter.lte = dateTo

  // 3a) Hitung total pending settlement
  const pendingAgg = await prisma.order.aggregate({
    _sum: { pendingAmount: true },
    where: {
      merchantId: pc.id,
      status:     'PENDING_SETTLEMENT',
      ...(dateFrom||dateTo ? { createdAt: createdAtFilter } : {})
    }
  })
  const totalPending = pendingAgg._sum.pendingAmount ?? 0

  // 3b) Ambil semua order termasuk PENDING_SETTLEMENT
  const orders = await prisma.order.findMany({
    where: {
      merchantId: pc.id,
      status: {
        in: ['SUCCESS', 'DONE', 'SETTLED', 'PENDING_SETTLEMENT']
      },
      ...(dateFrom||dateTo ? { createdAt: createdAtFilter } : {})
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id:               true,
      qrPayload:        true,
      amount:           true,
      feeLauncx:        true,
      settlementAmount: true,
      pendingAmount:    true,  // <- pastikan ini ada
      status:           true,
      createdAt:        true
    }
  })

  // 4) Ringkasan total transaksi (kecuali yang pending settlement)
  const totalTransaksi = orders
    .filter(o => o.status !== 'PENDING_SETTLEMENT')
    .reduce((sum, o) => sum + o.amount, 0)

  // 5) Bentuk payload response
  const transactions = orders.map(o => {
    const netSettle = o.status === 'PENDING_SETTLEMENT'
      ? (o.pendingAmount ?? 0) - (o.feeLauncx ?? 0)
      : ((o.settlementAmount ?? o.amount) - (o.feeLauncx ?? 0))

    return {
      id:        o.id,
      date:      o.createdAt.toISOString(),
      reference: o.qrPayload ?? '',
      amount:    o.amount,
      feeLauncx: o.feeLauncx ?? 0,
      netSettle,
      status:    o.status
    }
  })

  // 6) Return JSON
  return res.json({
    balance:        pc.balance,
    totalTransaksi,
    totalPending,
    transactions
  })
}


/**
 * GET /api/v1/client/dashboard/export
 * – export semua transaksi SUCCESS, DONE, SETTLED, PENDING_SETTLEMENT ke Excel
 */
export async function exportClientTransactions(req: ClientAuthRequest, res: Response) {
  const user = await prisma.clientUser.findUnique({
    where: { id: req.clientUserId! },
    include: { partnerClient: true }
  })
  if (!user) return res.status(404).json({ error: 'User tidak ditemukan' })
  const pcId = user.partnerClient.id

  const orders = await prisma.order.findMany({
    where: {
      merchantId: pcId,
      status: { in: ['SUCCESS', 'DONE', 'SETTLED', 'PENDING_SETTLEMENT'] }
    },
    orderBy: { createdAt: 'desc' },
    select: {
      createdAt:        true,
      id:               true,
      amount:           true,
      pendingAmount:    true,
      settlementAmount: true,
      feeLauncx:        true,
      status:           true
    }
  })

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Transactions')
  ws.columns = [
    { header: 'Tanggal', key: 'date',            width: 20 },
    { header: 'ID',      key: 'id',              width: 36 },
    { header: 'Jumlah',  key: 'amount',          width: 15 },
    { header: 'Pending', key: 'pendingAmount',   width: 15 },
    { header: 'Settled', key: 'settlementAmount',width: 15 },
    { header: 'Fee',     key: 'feeLauncx',       width: 15 },
    { header: 'Status',  key: 'status',          width: 16 },
  ]
  orders.forEach(o => {
    ws.addRow({
      date:             o.createdAt.toISOString(),
      id:               o.id,
      amount:           o.amount,
      pendingAmount:    o.pendingAmount ?? 0,
      settlementAmount: o.settlementAmount ?? 0,
      feeLauncx:        o.feeLauncx ?? 0,
      status:           o.status
    })
  })

  res.setHeader('Content-Disposition', 'attachment; filename=client-transactions.xlsx')
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  await wb.xlsx.write(res)
  res.end()
}
/**
 * POST /api/v1/client/dashboard/withdraw
 */
export async function validateAccount(req: ClientAuthRequest, res: Response) {
  const { account_number, bank_code } = req.body
  try {
    const result = await hilogateClient.validateAccount(account_number, bank_code)
    // Kirim data validasi ke klien
    return res.json(result.data)
  } catch (err: any) {
    return res.status(400).json({ message: err.message || 'Validasi akun gagal' })
  }
}
export const requestWithdraw = async (req: ClientAuthRequest, res: Response) => {
  const { account_name, account_name_alias, account_number, bank_code, bank_name, branch_name, amount } = req.body;
  const pc = await prisma.partnerClient.findUnique({ where: { id: (req as any).partnerClientId } });
  
  // 1) Periksa saldo aktif
  if (!pc || amount > pc.balance) {
    return res.status(400).json({ error: 'Insufficient balance' });
  }

  // 2) Validasi rekening via Hilogate
  try {
    const valid = await hilogateClient.validateAccount(account_number, bank_code);
    if (!valid.data.data.is_valid) throw new Error('Invalid account');
  } catch (e: any) {
    return res.status(400).json({ error: e.message || 'Account validation failed' });
  }

  // 3) Buat record withdraw di DB (PENDING) + hold saldo
  const wr = await prisma.withdrawRequest.create({
    data: {
      refId: `wd-${Date.now()}`,
      partnerClientId: pc.id,
      accountName: account_name,
      accountNameAlias: account_name_alias,
      accountNumber: account_number,
      bankCode: bank_code,
      bankName: bank_name,
      branchName: branch_name,
      amount,
      status: 'PENDING',
    },
  });
  await prisma.partnerClient.update({
    where: { id: pc.id },
    data: { balance: { decrement: amount } },
  });

  // 4) Kirim request ke Hilogate
  try {
    const hg = await hilogateClient.initiateDisbursement({
      ref_id: wr.refId,
      amount,
      beneficiary: {
        account_number,
        account_name,
        bank_code,
      },
    });
    // update paymentGatewayId & transfer flag
    await prisma.withdrawRequest.update({
      where: { refId: wr.refId },
      data: {
        paymentGatewayId: hg.data.data.id,
        isTransferProcess: hg.data.data.is_transfer_process,
        status: 'PENDING',
      },
    });
  } catch (e: any) {
    // jika gagal panggilan API, kembalikan saldo
    await prisma.partnerClient.update({
      where: { id: pc.id },
      data: { balance: { increment: amount } },
    });
    await prisma.withdrawRequest.update({
      where: { refId: wr.refId },
      data: { status: 'FAILED' },
    });
    return res.status(500).json({ error: 'Disbursement init failed' });
  }

  return res.status(201).json({ id: wr.id, status: wr.status });
};