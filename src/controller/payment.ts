import { Request, Response } from 'express';
import { createErrorResponse, createSuccessResponse } from '../util/response';
import paymentService, {
  Transaction,
  OrderRequest,
  OrderResponse,
} from '../service/payment';

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

/* ═════════ 2. Callback dari payment-gateway ═════════ */
export const transactionCallback = async (req: Request, res: Response) => {
  try {
    await paymentService.transactionCallback(req);
    return res
      .status(200)
      .json(createSuccessResponse({ message: 'Callback stored' }));
  } catch (err: any) {
    return res
      .status(400)
      .json(createErrorResponse(err.message ?? 'Callback failed'));
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
