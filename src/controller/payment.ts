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

export const transactionCallback = async (req: AuthRequest, res: Response) => {
  try {
    const path    = '/api/v1/transactions/callback';
    const rawBody = (req as any).rawBody.toString('utf8');
    const payload = JSON.parse(rawBody);

    // Signature MD5 ala Hilogate
    const minimal  = JSON.stringify({
      ref_id: payload.ref_id,
      amount: payload.amount,
      method: payload.method
    });
    const expected = crypto
      .createHash('md5')
      .update(path + minimal + config.api.hilogate.secretKey, 'utf8')
      .digest('hex');
    const got = req.header('X-Signature') || req.header('x-signature') || '';
    if (got !== expected) throw new Error('Invalid signature');

    // Simpan raw callback untuk idempotensi
    await paymentService.transactionCallback(req);

    // Extract langsung dari root payload
    const {
      ref_id: orderId,
      status: pgStatus,
      net_amount,
      payment_gateway_fee = 0,
      fee                 = 0,
      qr_string,
      settlement_status
    } = payload;

    if (!orderId)           throw new Error('Missing ref_id');
    if (net_amount == null) throw new Error('Missing net_amount');

    const isInitialSuccess = ['SUCCESS','DONE'].includes(pgStatus.toUpperCase());
    const newStatus        = isInitialSuccess ? 'PENDING_SETTLEMENT' : pgStatus.toUpperCase();
    const newSettlementSt  = settlement_status?.toUpperCase()
                              ?? (isInitialSuccess ? 'PENDING' : null);

    await prisma.order.update({
      where: { id: orderId },
      data: {
        merchantId:       req.userId!,
        status:           newStatus,
        settlementStatus: newSettlementSt,
        amount:           net_amount,
        pendingAmount:    isInitialSuccess ? net_amount : null,
        settlementAmount: null,
        fee3rdParty:      payment_gateway_fee,
        feeLauncx:        fee,
        qrPayload:        qr_string ?? null,
        updatedAt:        new Date(),
      },
    });

    return res.status(200).json(createSuccessResponse({ message: 'OK' }));
  } catch (err: any) {
    logger.error('Callback error:', err.message);
    return res.status(400).json(createErrorResponse(err.message));
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
