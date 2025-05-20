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

export const transactionCallback = async (req: Request, res: Response) => {
  try {
    // 1) Tangkap rawBody dan request path persis
    const raw = (req as any).rawBody as string;
    if (!raw) throw new Error('Empty rawBody');
    const path = req.originalUrl; // "/api/v1/transaction/callback"

    // 2) Hitung signature = MD5(path + rawBody + merchantSecretKey)
    const expected = crypto
      .createHash('md5')
      .update(path + raw + config.api.hilogate.secretKey)
      .digest('hex');

    // 3) Ambil signature dari header
    const got = req.header('X-Signature') || '';
    logger.info('Hilogate callback signature', { expected, got });

    if (got !== expected) {
      logger.error('Invalid Hilogate signature', { expected, got });
      return res
        .status(400)
        .json(createErrorResponse('Invalid Hilogate signature'));
    }

    // 4) Simpan payload ke transaction_callback + update transaction_request
    await paymentService.transactionCallback(req);

    // 5) Update tabel order: status & qrPayload
    const body = JSON.parse(raw) as any;
    const dataObj = body.data;
    if (!dataObj?.ref_id) throw new Error('Missing data.ref_id');
    const refId = dataObj.ref_id as string;

    await prisma.order.update({
      where: { id: refId },
      data: {
        status: dataObj.status === 'SUCCESS' ? 'DONE' : 'FAILED',
        qrPayload: dataObj.qr_string,
      },
    });

    return res
      .status(200)
      .json(createSuccessResponse({ message: 'Callback stored & Order updated' }));
  } catch (err: any) {
    logger.error('Callback error', err.message);
    return res
      .status(400)
      .json(createErrorResponse(err.message));
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
