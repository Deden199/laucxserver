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
  try {
    console.log('--- getClientDashboard START ---')
    console.log('clientUserId:', req.clientUserId)
    console.log('query params:', req.query)

    // (1) ambil user + partnerClient + children
    const user = await prisma.clientUser.findUnique({
      where: { id: req.clientUserId! },
      include: {
        partnerClient: {
          include: {
            children: { select: { id: true, name: true } }
          }
        }
      }
    })
    if (!user) {
      console.warn('User tidak ditemukan untuk id', req.clientUserId)
      return res.status(404).json({ error: 'User tidak ditemukan' })
    }
    const pc = user.partnerClient!
    console.log('partnerClient loaded:', { id: pc.id, childrenCount: pc.children.length })

    // (2) parse tanggal
    const dateFrom = req.query.date_from ? new Date(String(req.query.date_from)) : undefined
    const dateTo   = req.query.date_to   ? new Date(String(req.query.date_to))   : undefined
    console.log('dateFrom:', dateFrom, 'dateTo:', dateTo)
    const createdAtFilter: any = {}
    if (dateFrom) createdAtFilter.gte = dateFrom
    if (dateTo)   createdAtFilter.lte = dateTo

    // (3) build list of IDs to query
    let clientIds: string[]
    if (typeof req.query.clientId === 'string' && req.query.clientId !== 'all' && req.query.clientId.trim()) {
      clientIds = [req.query.clientId]
      console.log('override dengan single child:', clientIds)
    } else if (pc.children.length > 0) {
      clientIds = [pc.id, ...pc.children.map(c => c.id)]
      console.log('parent + children => clientIds:', clientIds)
    } else {
      clientIds = [pc.id]
      console.log('user biasa => clientIds:', clientIds)
    }

    // (4a) total pending
    const pendingAgg = await prisma.order.aggregate({
      _sum: { pendingAmount: true },
      where: {
        partnerClientId: { in: clientIds },
        status: 'PENDING_SETTLEMENT',
        ...(dateFrom||dateTo ? { createdAt: createdAtFilter } : {})
      }
    })
    const totalPending = pendingAgg._sum.pendingAmount ?? 0
    console.log('totalPending:', totalPending)

    // (4b) ambil transaksi
    const orders = await prisma.order.findMany({
      where: {
        partnerClientId: { in: clientIds },
        status: { in: ['SUCCESS','DONE','SETTLED','PENDING_SETTLEMENT'] },
        ...(dateFrom||dateTo ? { createdAt: createdAtFilter } : {})
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, qrPayload: true, rrn: true, playerId: true,
        amount: true, feeLauncx: true, settlementAmount: true,
        pendingAmount: true, status: true, createdAt: true
      }
    })
    console.log(`ditemukan ${orders.length} order(s)`)

    // (5) hitung total non‐pending
    const totalTransaksi = orders
      .filter(o => o.status !== 'PENDING_SETTLEMENT')
      .reduce((sum, o) => sum + o.amount, 0)
    console.log('totalTransaksi:', totalTransaksi)

// (6) map
const transactions = orders.map(o => {
  // langsung pakai pendingAmount atau settlementAmount sebagai net
  const netSettle = o.status === 'PENDING_SETTLEMENT'
    ? (o.pendingAmount ?? 0)         // sudah net sejak callback
    : (o.settlementAmount ?? 0)      // sudah net sejak create/order settled

  return {
    id: o.id,
    date: o.createdAt.toISOString(),
    reference: o.qrPayload ?? '',
    rrn: o.rrn ?? '',
    playerId: o.playerId,
    amount: o.amount,                 // gross, untuk info saja
    feeLauncx: o.feeLauncx ?? 0,      // fee internal
    netSettle,                        // net langsung
    settlementStatus: o.status,
    status: o.status === 'DONE' ? 'DONE' : 'SUCCESS'
  }
})


    console.log('mengirim response dengan children:', pc.children)
    console.log('--- getClientDashboard END ---')

    return res.json({
      balance: pc.balance,
      totalPending,
      totalTransaksi,
      transactions,
      children: pc.children
    })

  } catch (err: any) {
    console.error('Error di getClientDashboard:', err)
    return res.status(500).json({ error: err.message || 'Internal Server Error' })
  }
}

export async function exportClientTransactions(req: ClientAuthRequest, res: Response) {
  // (1) load user + children
  const user = await prisma.clientUser.findUnique({
    where: { id: req.clientUserId! },
    include: {
      partnerClient: {
        include: {
          children: { select: { id: true, name: true } }
        }
      }
    }
  })
  if (!user) return res.status(404).json({ error: 'User tidak ditemukan' })
  const pc = user.partnerClient

  // (2) parse tanggal
  const dateFrom = req.query.date_from ? new Date(String(req.query.date_from)) : undefined
  const dateTo   = req.query.date_to   ? new Date(String(req.query.date_to))   : undefined
  const createdAtFilter: any = {}
  if (dateFrom) createdAtFilter.gte = dateFrom
  if (dateTo)   createdAtFilter.lte = dateTo

  // (3) siapkan daftar IDs
const clientIds = req.isParent
  ? [pc.id, ...pc.children.map(c => c.id)]  // <<< include parent juga
  : [pc.id]
console.log('export clientIds:', clientIds)

  // (4) ambil semua order
  const orders = await prisma.order.findMany({
    where: {
      partnerClientId: { in: clientIds },
      status: { in: ['SUCCESS','DONE','SETTLED','PENDING_SETTLEMENT'] },
      ...(dateFrom||dateTo ? { createdAt: createdAtFilter } : {})
    },
    orderBy: { createdAt: 'desc' },
    select: {
      partnerClientId:  true,
      id:               true,
      rrn:              true,
      playerId:         true,
      amount:           true,
      pendingAmount:    true,
      settlementAmount: true,
      feeLauncx:        true,
      status:           true,
      createdAt:        true,
    }
  })

  // (5) map ID→name untuk semua child
  const idToName: Record<string,string> = {}
  pc.children.forEach(c => { idToName[c.id] = c.name })
  // (opsional, jika parent juga mau ditampilkan di All-sheet)
  idToName[pc.id] = pc.name

  // (6) group per partnerClientId
  const byClient: Record<string, typeof orders> = {}
  orders.forEach(o => {
    byClient[o.partnerClientId] ??= []
    byClient[o.partnerClientId].push(o)
  })

  // (7) buat workbook + sheet “All Transactions”
  const wb = new ExcelJS.Workbook()
  const all = wb.addWorksheet('All Transactions')
  all.columns = [
    { header: 'Child Name', key: 'name',   width: 30 },
    { header: 'Order ID',    key: 'id',     width: 36 },
    { header: 'RRN',         key: 'rrn',    width: 24 },
    { header: 'Player ID',   key: 'player', width: 20 },
    { header: 'Amount',      key: 'amt',    width: 15 },
    { header: 'Pending',     key: 'pend',   width: 15 },
    { header: 'Settled',     key: 'sett',   width: 15 },
    { header: 'Fee',         key: 'fee',    width: 15 },
    { header: 'Status',      key: 'stat',   width: 16 },
    { header: 'Date',        key: 'date',   width: 20 },
  ]

  orders.forEach(o => {
    all.addRow({
      name:   idToName[o.partnerClientId] || o.partnerClientId,
      id:     o.id,
      rrn:    o.rrn ?? '',
      player: o.playerId,
      amt:    o.amount,
      pend:   o.pendingAmount ?? 0,
      sett:   o.settlementAmount ?? 0,
      fee:    o.feeLauncx ?? 0,
      stat:   o.status,
      date:   o.createdAt.toISOString(),
    })
  })

  // (8) buat sheet per child
  for (const child of pc.children) {
    const sheet = wb.addWorksheet(child.name)
    sheet.columns = all.columns.slice(1) // kecuali kolom “Child Name”
    const list = byClient[child.id] || []
    list.forEach(o => {
      sheet.addRow({
        id:     o.id,
        rrn:    o.rrn ?? '',
        player: o.playerId,
        amt:    o.amount,
        pend:   o.pendingAmount ?? 0,
        sett:   o.settlementAmount ?? 0,
        fee:    o.feeLauncx ?? 0,
        stat:   o.status,
        date:   o.createdAt.toISOString(),
      })
    })
  }

  // (9) kirim file
  res.setHeader('Content-Disposition','attachment; filename=client-transactions.xlsx')
  res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  await wb.xlsx.write(res)
  res.end()
}

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