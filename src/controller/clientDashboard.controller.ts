import { Response } from 'express'
import { prisma } from '../core/prisma'
import { DisbursementStatus } from '@prisma/client'
import hilogateClient from '../service/hilogateClient'
import { ClientAuthRequest } from '../middleware/clientAuth'
import ExcelJS from 'exceljs'
import crypto from 'crypto';



export async function getClientCallbackUrl(req: ClientAuthRequest, res: Response) {
  // Cari clientUser untuk dapatkan partnerClientId
  const user = await prisma.clientUser.findUnique({
    where: { id: req.clientUserId! },
    select: { partnerClientId: true },
  })
  if (!user) {
    return res.status(404).json({ error: 'User tidak ditemukan' })
  }

  // Ambil data callback dari partnerClient
  const partner = await prisma.partnerClient.findUnique({
    where: { id: user.partnerClientId },
    select: { callbackUrl: true, callbackSecret: true },
  })
  if (!partner) {
    return res.status(404).json({ error: 'PartnerClient tidak ditemukan' })
  }

  return res.json({
    callbackUrl:    partner.callbackUrl || '',
    callbackSecret: partner.callbackSecret || '',
  })
}

/**
 * POST /api/v1/client/callback-url
 * Body: { callbackUrl: string }
 * – Update callbackUrl dan hasilkan callbackSecret jika belum ada
 */
export async function updateClientCallbackUrl(req: ClientAuthRequest, res: Response) {
  const { callbackUrl } = req.body

  // Validasi format HTTPS
  if (typeof callbackUrl !== 'string' || !/^https:\/\/.+/.test(callbackUrl)) {
    return res.status(400).json({ error: 'Callback URL harus HTTPS' })
  }

  // Dapatkan partnerClientId
  const user = await prisma.clientUser.findUnique({
    where: { id: req.clientUserId! },
    select: { partnerClientId: true },
  })
  if (!user) {
    return res.status(404).json({ error: 'User tidak ditemukan' })
  }

  // Generate callbackSecret jika terkirim pertama
  const existing = await prisma.partnerClient.findUnique({
    where: { id: user.partnerClientId },
    select: { callbackSecret: true },
  })
  let secret = existing?.callbackSecret
  if (!secret) {
    secret = crypto.randomBytes(32).toString('hex')
  }

  // Simpan callbackUrl & callbackSecret
  const updated = await prisma.partnerClient.update({
    where: { id: user.partnerClientId },
    data: { callbackUrl, callbackSecret: secret },
    select: { callbackUrl: true, callbackSecret: true },
  })

  return res.json({
    callbackUrl:    updated.callbackUrl,
    callbackSecret: updated.callbackSecret,
  })
}
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
const BANK_NAMES: Record<string, string> = {
  mandiri:         'Bank Mandiri',
  bri:             'Bank Rakyat Indonesia',
  bca:             'Bank Central Asia',
  cimb:            'CIMB Niaga & CIMB Niaga Syariah',
  muamalat:        'Bank Muamalat',
  permata:         'Bank Permata & Permata Syariah',
  bii:             'Maybank Indonesia',
  panin:           'Panin Bank',
  ocbc:            'OCBC NISP',
  citibank:        'Citibank',
  artha:           'Bank Artha Graha Internasional',
  tokyo:           'Bank of Tokyo Mitsubishi UFJ',
  dbs:             'DBS Indonesia',
  standard_char:   'Standard Chartered Bank',
  // tambahkan kode lain jika perlu
}

/**
 * POST /api/v1/client/dashboard/withdraw/validate
 */
export async function validateAccount(req: ClientAuthRequest, res: Response) {
  const { account_number, bank_code } = req.body
  try {
    const payload = (await hilogateClient.validateAccount(account_number, bank_code)).data

    if (payload.status !== 'valid') {
      return res.status(400).json({ error: 'Invalid account' })
    }

    // Hanya kirim kembali data yang tersedia
    return res.json({
      account_number: payload.account_number,
      account_holder: payload.account_holder,
      bank_code:      payload.bank_code,
      status:         payload.status,
    })
  } catch (err: any) {
    console.error('[validateAccount] error:', err)
    return res.status(400).json({ message: err.message || 'Validasi akun gagal' })
  }
}

// helper retry untuk deadlock/write conflict
async function retry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  let lastError: any
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (e: any) {
      lastError = e
      if (e.message?.includes('write conflict') || e.code === 'P2034') {
        // tunggu sejenak sebelum retry
        await new Promise(r => setTimeout(r, 50 * (i + 1)))
        continue
      }
      throw e
    }
  }
  throw lastError
}

/**
 * POST /api/v1/client/dashboard/withdraw
 */
export const requestWithdraw = async (req: ClientAuthRequest, res: Response) => {
  try {
    const { account_number, bank_code, account_name_alias, amount } = req.body

    // 1) Ambil user & partnerClient
    const user = await prisma.clientUser.findUnique({
      where: { id: req.clientUserId! },
      include: { partnerClient: true },
    })
    if (!user) return res.status(404).json({ error: 'User tidak ditemukan' })
    const pc = user.partnerClient

    // 2) Cek saldo aktif
    if (amount > pc.balance) {
      return res.status(400).json({ error: 'Insufficient balance' })
    }

    // 3) Validasi account via Hilogate
    const valid = (await hilogateClient.validateAccount(account_number, bank_code)).data
    if (valid.status !== 'valid') {
      return res.status(400).json({ error: 'Invalid account' })
    }

    // 4) Ambil nama pemilik
    const acctHolder = valid.account_holder

    // 5) Lookup nama bank
    const bankName   = BANK_NAMES[bank_code] ?? ''
    const branchName = ''  // tidak tersedia di Hilogate

    // 6) Tentukan alias
    const alias = account_name_alias ?? acctHolder

    // 7) Buat record withdraw + hold saldo
    const refId = `wd-${Date.now()}`
    const wr = await prisma.withdrawRequest.create({
      data: {
        refId,
        partnerClientId:  pc.id,
        accountName:      acctHolder,
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

    // 8) Kirim ke Hilogate
    const hg = await hilogateClient.createWithdrawal({
      ref_id:             refId,
      amount,
      currency:           'IDR',
      account_number,
      account_name:       acctHolder,
      account_name_alias: alias,
      bank_code,
      bank_name:          bankName,
      branch_name:        branchName,
      description:        `Withdraw Rp ${amount}`,
    })

    // 9) Mapping status
    const { id: pgId, status: hgStatus, is_transfer_process } = hg.data
    let newStatus: DisbursementStatus
    if (['WAITING','PENDING','PROCESSING'].includes(hgStatus)) {
      newStatus = DisbursementStatus.PENDING
    } else if (['COMPLETED','SUCCESS'].includes(hgStatus)) {
      newStatus = DisbursementStatus.COMPLETED
    } else {
      newStatus = DisbursementStatus.FAILED
    }

    // 10) Idempotent update + retry deadlock
    const result = await retry(() =>
      prisma.withdrawRequest.updateMany({
        where: { refId, status: DisbursementStatus.PENDING },
        data: {
          paymentGatewayId:  pgId,
          isTransferProcess: is_transfer_process,
          status:            newStatus,
        },
      })
    )

    if (result.count === 0) {
      console.warn(`[withdraw] refId=${refId} sudah di-update sebelumnya`)
    }

    // 11) Return response
    return res.status(201).json({ id: wr.id, refId, status: newStatus })

  } catch (err: any) {
    console.error('[requestWithdraw] error:', err)
    return res.status(500).json({ error: err.message || 'Internal server error' })
  }
}