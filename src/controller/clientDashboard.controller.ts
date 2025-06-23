import { Response } from 'express'
import { prisma } from '../core/prisma'
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
export async function requestWithdraw(req: ClientAuthRequest, res: Response) {
  const { amount } = req.body as { amount: number }
  const user = await prisma.clientUser.findUnique({
    where: { id: req.clientUserId! },
    include: { partnerClient: true }
  })
  if (!user) return res.status(404).json({ error: 'User not found' })
  const pc = user.partnerClient

  if (amount > pc.balance) {
    return res.status(400).json({ error: 'Insufficient balance' })
  }

  // buat request & deduct
  const wr = await prisma.withdrawRequest.create({
    data: { partnerClientId: pc.id, amount }
  })
  await prisma.partnerClient.update({
    where: { id: pc.id },
    data: { balance: { decrement: amount } }
  })

  return res.status(201).json({ id: wr.id, status: wr.status })
}
