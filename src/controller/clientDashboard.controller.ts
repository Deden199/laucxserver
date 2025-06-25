import { Response } from 'express'
import { prisma } from '../core/prisma'
import { DisbursementStatus } from '@prisma/client'
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

  // 2) Parse filter tanggal
  const dateFrom = req.query.date_from ? new Date(String(req.query.date_from)) : undefined
  const dateTo   = req.query.date_to   ? new Date(String(req.query.date_to))   : undefined
  const createdAtFilter: any = {}
  if (dateFrom) createdAtFilter.gte = dateFrom
  if (dateTo)   createdAtFilter.lte = dateTo

  // 3a) Total pending settlement
  const pendingAgg = await prisma.order.aggregate({
    _sum: { pendingAmount: true },
    where: {
      merchantId: pc.id,
      status:     'PENDING_SETTLEMENT',
      ...(dateFrom||dateTo ? { createdAt: createdAtFilter } : {})
    }
  })
  const totalPending = pendingAgg._sum.pendingAmount ?? 0

  // 3b) Ambil semua order relevant
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
      pendingAmount:    true,
      status:           true,
      rrn:              true,
      createdAt:        true
    }
  })

  // 4) Total transaksi (excl. pending)
  const totalTransaksi = orders
    .filter(o => o.status !== 'PENDING_SETTLEMENT')
    .reduce((sum, o) => sum + o.amount, 0)

  // 5) Map ke payload
  const transactions = orders.map(o => {
    const netSettle = o.status === 'PENDING_SETTLEMENT'
      ? (o.pendingAmount ?? 0) - (o.feeLauncx ?? 0)
      : ((o.settlementAmount ?? o.amount) - (o.feeLauncx ?? 0))

    // map status hanya SUCCESS/DONE
    const mappedStatus = o.status === 'DONE'
      ? 'DONE'
      : 'SUCCESS'

    return {
      id:               o.id,
      date:             o.createdAt.toISOString(),
      reference:        o.qrPayload ?? '',
      rrn:              o.rrn ?? '',
      amount:           o.amount,
      feeLauncx:        o.feeLauncx ?? 0,
      netSettle,
      // kirim settlementStatus asli
      settlementStatus: o.status,
      status:           mappedStatus
    }
  })

  // 6) Return
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
      status:           true,
      rrn:              true
    }
  })

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Transactions')
  ws.columns = [
    { header: 'Tanggal', key: 'date',            width: 20 },
    { header: 'ID',      key: 'id',              width: 36 },
    { header: 'RRN',     key: 'rrn',             width: 24 },  // ← **ADDED**: kolom header RRN

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
      rrn:              o.rrn ?? '',  // ← **ADDED**: isi data RRN
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
  try {
    const {
      account_name,
      account_name_alias,
      account_number,
      bank_code,
      amount,
    } = req.body

    // 1) Ambil user & partnerClient
    const user = await prisma.clientUser.findUnique({
      where: { id: req.clientUserId! },
      include: { partnerClient: true },
    })
    if (!user) {
      return res.status(404).json({ error: 'User tidak ditemukan' })
    }
    const pc = user.partnerClient

    // 2) Periksa saldo aktif
    if (amount > pc.balance) {
      return res.status(400).json({ error: 'Insufficient balance' })
    }

    // 3) Validasi rekening via Hilogate
    const valid = await hilogateClient.validateAccount(account_number, bank_code)
    if (valid.data.status !== 'valid') {
      return res.status(400).json({ error: 'Invalid account' })
    }

    // 4) Ambil nama bank & cabang, fallback
    const bankName   = valid.data.bank_name   ?? ''
    const branchName = valid.data.branch_name ?? ''

    // 5) Tentukan alias
    const alias = account_name_alias ?? account_name

    // 6) Buat record withdraw + hold saldo
    const refId = `wd-${Date.now()}`
    const wr = await prisma.withdrawRequest.create({
      data: {
        refId,
        partnerClientId:  pc.id,
        accountName:      account_name,
        accountNameAlias: alias,
        accountNumber:    account_number,
        bankCode:         bank_code,
        bankName,
        branchName,
        amount,
        status:           DisbursementStatus.PENDING,
      },
    })
    await prisma.partnerClient.update({
      where: { id: pc.id },
      data: { balance: { decrement: amount } },
    })

    // 7) Kirim request ke Hilogate (Create Withdrawal)
    let hg
    try {
      hg = await hilogateClient.createWithdrawal({
        ref_id:             refId,
        amount,
        currency:           'IDR',
        account_number:     account_number,
        account_name:       account_name,
        account_name_alias: alias,
        bank_code:          bank_code,
        bank_name:          bankName,
        branch_name:        branchName,
        description:        `Withdraw Rp ${amount}`,
      })
    } catch (e: any) {
      // rollback saldo & tandai gagal
      await prisma.partnerClient.update({
        where: { id: pc.id },
        data: { balance: { increment: amount } },
      })
      await prisma.withdrawRequest.update({
        where: { refId },
        data: { status: DisbursementStatus.FAILED },
      })

      // logging detail
      console.error('[Hilogate Error] Message:', e.message)
      if (e.response) {
        console.error('[Hilogate Error] URL:',            e.response.config.baseURL + e.response.config.url)
        console.error('[Hilogate Error] Status:',         e.response.status)
        console.error('[Hilogate Error] Request Payload:', e.response.config.data)
        console.error('[Hilogate Error] Response Data:',  e.response.data)
      }

      return res.status(502).json({
        error:   'Disbursement failed',
        details: e.response?.data || e.message,
      })
    }

    // 8) Pemetaan status dari Hilogate ke enum internal
    const { id: pgId, status: hgStatus, is_transfer_process } = hg.data
    const newStatus = ((): DisbursementStatus => {
      switch (hgStatus) {
        case 'WAITING':
        case 'PENDING':    return DisbursementStatus.PENDING
        case 'PROCESSING':  return DisbursementStatus.PENDING

        
        case 'COMPLETED':
        case 'SUCCESS':    return DisbursementStatus.COMPLETED
        case 'FAILED':
        case 'ERROR':      return DisbursementStatus.FAILED
        default:           return DisbursementStatus.PENDING
      }
    })()

    await prisma.withdrawRequest.update({
      where: { refId },
      data: {
        paymentGatewayId:  pgId,
        isTransferProcess: is_transfer_process,
        status:            newStatus,
      },
    })

    // 9) Return success
    return res.status(201).json({ id: wr.id, refId, status: newStatus })
  } catch (err: any) {
    console.error('[requestWithdraw] error:', err)
    return res.status(500).json({ error: err.message || 'Internal server error' })
  }
}