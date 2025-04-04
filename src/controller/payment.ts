import { Request, Response } from 'express';
import { createErrorResponse, createSuccessResponse } from '../util/response';
import paymentService, { Transaction } from '../service/payment';

const createTransaction = async (req: Request, res: Response) => {
  try {
    // Ambil data dari route params dan query
    const transaction: Transaction = {
      merchantName: req.params.merchantId, // Gunakan "gv" atau "gudangvoucher" untuk integrasi GV
      price: Number(req.params.amount),
      buyer: req.query.userId as string,
    };

    const paymentResponse = await paymentService.createTransaction(transaction);
    return res.status(200).json(createSuccessResponse(paymentResponse));
  } catch (error: any) {
    return res.status(500).json(createErrorResponse(error.message || 'Merchant not found'));
  }
};

const transactionCallback = async (req: Request, res: Response) => {
  try {
    const callbackResponse = await paymentService.transactionCallback(req);
    return res.status(201).json(createSuccessResponse('Transaction stored successfully'));
  } catch (error: any) {
    return res.status(500).json(createErrorResponse('Processing failed'));
  }
};

const checkPaymentStatus = async (req: Request, res: Response) => {
  try {
    const paymentStatusResponse = await paymentService.checkPaymentStatus(req);
    return res.status(201).json(createSuccessResponse(paymentStatusResponse));
  } catch (error: any) {
    return res.status(500).json(createErrorResponse('No Response yet'));
  }
};

const paymentController = {
  createTransaction,
  transactionCallback,
  checkPaymentStatus,
};

export default paymentController;
