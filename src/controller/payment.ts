import crypto                           from 'crypto'
import { Request, Response }            from 'express'
import { config }                       from '../config'
import logger                           from '../logger'
import { createErrorResponse,
         createSuccessResponse }        from '../util/response'
import paymentService, {
  Transaction,
  OrderRequest,
  OrderResponse,
}                                       from '../service/payment'
import { AuthRequest }                  from '../middleware/auth'
import { prisma }               from '../core/prisma'

/* ═════════════════ 1. Legacy / Direct Transaction ═════════════════ */
export const createTransaction = async (req: AuthRequest, res: Response) => {
  try {
    const merchantName = String(req.body.merchantName ?? '').trim().toLowerCase() // wajib
    const price        = Number(req.body.price ?? req.body.amount)
    const buyer        = String(req.body.buyer ?? req.body.userId ?? '')

    if (!merchantName)
      return res.status(400).json(createErrorResponse('`merchantName` wajib diisi'))
    if (isNaN(price) || price <= 0)
      return res.status(400).json(createErrorResponse('`price/amount` harus > 0'))

    /* Sesuai interface Transaction (TANPA merchantId) */
    const trx: Transaction = { merchantName, price, buyer }

    const result = await paymentService.createTransaction(trx)
    return res.status(201).json(createSuccessResponse(result))
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message ?? 'Internal error'))
  }
}

export const transactionCallback = async (req: Request, res: Response) => {
  let rawBody: string

  try {
    const requestPath = '/api/v1/transactions'

    // 1) Baca rawBody & log
    rawBody = (req as any).rawBody.toString('utf8')
    logger.debug('[Callback] rawBody:', rawBody)

    // 2) Verifikasi signature
    const full = JSON.parse(rawBody) as any
    const minimalPayload = JSON.stringify({
      ref_id: full.ref_id,
      amount: full.amount,
      method: full.method
    })
    const expected = crypto
      .createHash('md5')
      .update(requestPath + minimalPayload + config.api.hilogate.secretKey, 'utf8')
      .digest('hex')
    const got = req.header('X-Signature') || req.header('x-signature') || ''
    logger.debug('[Callback] signature got=', got, ' expected=', expected)
    if (got !== expected) {
      throw new Error(`Invalid Hilogate signature: got=${got}`)
    }

    // 3) Simpan raw callback untuk idempotensi
    await paymentService.transactionCallback(req)

    // 4) Extract fields
    const {
      ref_id: orderId,
      status: pgStatus,
      net_amount,
      payment_gateway_fee = 0,
      fee = 0,
      qr_string,
      settlement_status
    } = full

    if (!orderId) throw new Error('Missing ref_id')
    if (net_amount == null) throw new Error('Missing net_amount')

    // 5) Hitung status baru
    const upStatus = pgStatus.toUpperCase()
    const isInitialSuccess = ['SUCCESS','DONE'].includes(upStatus)
    const newStatus       = isInitialSuccess ? 'PENDING_SETTLEMENT' : upStatus
    const newSettlementSt = settlement_status?.toUpperCase() ?? (isInitialSuccess ? 'PENDING' : null)

    // 6) Pastikan order ada & ambil merchantId-nya untuk keamanan
    const existing = await prisma.order.findUnique({ where: { id: orderId } })
    if (!existing) {
      throw new Error(`Order with id=${orderId} not found`)
    }

    // 7) Update order (tanpa menimpa merchantId)
    await prisma.order.update({
      where: { id: orderId },
      data: {
        status:           newStatus,
        settlementStatus: newSettlementSt,
        amount:           net_amount,
        pendingAmount:    isInitialSuccess ? net_amount : null,
        settlementAmount: isInitialSuccess ? null : net_amount,
        fee3rdParty:      payment_gateway_fee,
        feeLauncx:        fee,
        qrPayload:        qr_string ?? null,
        updatedAt:        new Date()
      }
    })

    // 8) Kirim respon sukses
    return res
      .status(200)
      .json(createSuccessResponse({ message: 'OK' }))

  } catch (err: any) {
    logger.error('[Callback] Error processing transaction:', err)
    if (rawBody && !err.message.startsWith('Invalid Hilogate signature')) {
      logger.debug('[Callback] rawBody on error:', rawBody)
    }
    return res
      .status(400)
      .json(createErrorResponse(err.message || 'Unknown error'))
  }
}

/* ═════════════════ 3. Inquiry status ═════════════════ */
export const checkPaymentStatus = async (req: AuthRequest, res: Response) => {
  try {
    const resp = await paymentService.checkPaymentStatus(req)
    return res.status(200).json(createSuccessResponse(resp))
  } catch (err: any) {
    return res.status(400).json(createErrorResponse(err.message ?? 'Unable to fetch status'))
  }
}

/* ═════════════════ 4. Order Aggregator (QR/Checkout) ═════════════════ */
export const createOrder = async (req: Request, res: Response) => {
  try {
    // ambil clientId yang di-inject oleh apiKeyAuth
    const userId = (req as any).clientId as string
    const amount = Number(req.body.amount)
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json(createErrorResponse('`amount` harus > 0'))
    }

    const payload: OrderRequest = { userId, amount }
    const order: OrderResponse = await paymentService.createOrder(payload)
    return res.status(201).json(createSuccessResponse(order))
  } catch (err: any) {
    return res
      .status(400)
      .json(createErrorResponse(err.message ?? 'Order creation failed'))
  }
}

/* ═════════════════ 5. Get order detail ═════════════════ */
export const getOrder = async (req: AuthRequest, res: Response) => {
  try {
    const order = await paymentService.getOrder(req.params.id)
    if (!order) return res.status(404).json(createErrorResponse('Order not found'))
    return res.status(200).json(createSuccessResponse(order))
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message ?? 'Unable to fetch order'))
  }
}

export default {
  createTransaction,
  transactionCallback,
  checkPaymentStatus,
  createOrder,
  getOrder,
}
