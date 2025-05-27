import crypto from 'crypto';
import { config } from '../config';
import logger from '../logger';
import { Request, Response } from 'express';
import { createErrorResponse, createSuccessResponse } from '../util/response';
import paymentService, {
  Transaction,
  OrderRequest,
  OrderResponse,
} from '../service/payment';
import { prisma } from '../core/prisma';

/* ═════════ 1. Buat transaksi (legacy & Hilogate) ═════════ */
export const createTransaction = async (req: Request, res: Response) => {
  try {
    // Support both new and legacy payloads
    const merchantName = req.body.merchantName ?? req.body.merchantId;
    const price = req.body.price ?? req.body.amount;
    const buyer = req.body.buyer ?? req.body.userId;

    if (!merchantName || price == null) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            '`merchantName` (atau `merchantId`) dan `price` (atau `amount`) wajib di-isi'
          )
        );
    }

    const trx: Transaction = {
      merchantName: String(merchantName),
      price: Number(price),
      buyer: String(buyer ?? ''),
    };

    const result = await paymentService.createTransaction(trx);
    return res.status(201).json(createSuccessResponse(result));
  } catch (err: any) {
    return res
      .status(500)
      .json(createErrorResponse(err.message ?? 'Internal error'));
  }
};

// === src/controller/payment.ts ===
export const transactionCallback = async (req: Request, res: Response) => {
  try {
    // 1) Path fixed sesuai spec Hilogate
    const requestPath = '/api/v1/transactions';
    // 2) Ambil rawBody buffer → string
    const raw = (req as any).rawBody.toString('utf8');
    // 3) Hitung signature atas minimalPayload mereka
    const full = JSON.parse(raw) as any;
    const minimalPayload = {
      ref_id: full.ref_id,
      amount: full.amount,
      method: full.method,
    };
    const minimalJson = JSON.stringify(minimalPayload);
    const signaturePayload = requestPath + minimalJson + config.api.hilogate.secretKey;
    const expected = crypto.createHash('md5').update(signaturePayload, 'utf8').digest('hex');
    const got = req.header('X-Signature') || req.header('x-signature') || '';
    if (got !== expected) throw new Error('Invalid Hilogate signature');

    // 4) Simpan callback ke DB
    await paymentService.transactionCallback(req);

    // 5) Update order berdasarkan full.ref_id (root) dan full.data.qr_string
    const orderId = full.ref_id;
    if (!orderId) throw new Error('Missing root ref_id');
    const qr = full.data?.qr_string;
    if (qr === undefined) throw new Error('Missing data.qr_string');

    await prisma.order.update({
      where: { id: orderId },
      data: {
        status:    full.status === 'SUCCESS' ? 'DONE' : 'FAILED',
        qrPayload: qr,
      },
    });

    // 6) Balik sukses
    return res.status(200).json(createSuccessResponse({ message: 'Callback stored & Order updated' }));
  } catch (err: any) {
    logger.error('Callback error:', err.message);
    return res.status(400).json(createErrorResponse(err.message));
  }
};


/* ═════════ 3. Cek status order ═════════ */
export const checkPaymentStatus = async (req: Request, res: Response) => {
  try {
    const statusResp = await paymentService.checkPaymentStatus(req);
    return res.status(200).json(createSuccessResponse(statusResp));
  } catch (err: any) {
    return res
      .status(400)
      .json(createErrorResponse(err.message ?? 'Unable to fetch status'));
  }
};

/* ═════════ 4. Buat order agregator ═════════ */
export const createOrder = async (req: Request, res: Response) => {
  try {
    const payload = req.body as OrderRequest;
    const order: OrderResponse = await paymentService.createOrder(payload);
    return res.status(201).json(createSuccessResponse(order));
  } catch (err: any) {
    return res
      .status(400)
      .json(createErrorResponse(err.message ?? 'Order creation failed'));
  }
};

/* ═════════ 5. Ambil detail order (QR, amount, channel) ═════════ */
export const getOrder = async (req: Request, res: Response) => {
  try {
    const orderId = req.params.id;
    const order = await paymentService.getOrder(orderId);
    if (!order) {
      return res.status(404).json(createErrorResponse('Order not found'));
    }
    return res.status(200).json(createSuccessResponse(order));
  } catch (err: any) {
    return res
      .status(500)
      .json(createErrorResponse(err.message ?? 'Unable to fetch order'));
  }
};

export default {
  createTransaction,
  transactionCallback,
  checkPaymentStatus,
  createOrder,
  getOrder,
};
