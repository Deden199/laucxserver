import paymentController from '../controller/payment';
import { Router } from 'express';

const paymentRouter = Router();

/**
 * @swagger
 * /payments/transaction/callback:
 *   post:
 *     summary: Handle transaction callback
 *     description: Receives the transaction callback, updates the transaction status, sends notification.
 *     tags:
 *       - V1 Payment
 *     operationId: transactionCallback
 *     requestBody:
 *       description: Callback data from the payment service.
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               originalPartnerReferenceNo:
 *                 type: string
 *                 description: The reference ID for the original transaction.
 *               amount:
 *                 type: object
 *                 properties:
 *                   value:
 *                     type: number
 *                     description: The transaction amount.
 *               settlementAmount:
 *                 type: number
 *                 description: The settled transaction amount.
 *               additionalInfo:
 *                 type: object
 *                 properties:
 *                   qrDetail:
 *                     type: object
 *                     properties:
 *                       buyerFullname:
 *                         type: string
 *                         description: The name of the buyer.
 *                   paymentTime:
 *                     type: string
 *                     description: The payment time in ISO format.
 *     responses:
 *       201:
 *         description: Transaction successfully stored and processed.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Transaction stored successfully
 *       500:
 *         description: Internal server error while processing the callback.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Processing failed
 */
paymentRouter.post('/transaction/callback', paymentController.transactionCallback);

/**
 * @swagger
 * /payments/payment/{merchantId}/{amount}:
 *   get:
 *     summary: Create a transaction for a payment
 *     description: Creates a transaction for a payment, returns the payment QR code and details.
 *     tags:
 *       - V1 Payment
 *     operationId: createTransaction
 *     parameters:
 *       - in: path
 *         name: merchantId
 *         required: true
 *         description: The merchant's phone number or identifier.
 *         schema:
 *           type: string
 *       - in: path
 *         name: amount
 *         required: true
 *         description: The amount for the transaction.
 *         schema:
 *           type: string
 *       - in: query
 *         name: userId
 *         required: true
 *         description: The ID of the buyer.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Transaction successfully created and QR code generated.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 qrImage:
 *                   type: string
 *                   description: The QR code image URL.
 *                 totalAmount:
 *                   type: number
 *                   description: The total transaction amount.
 *                 expiredTs:
 *                   type: string
 *                   description: The expiration timestamp of the transaction.
 *                 referenceNo:
 *                   type: string
 *                   description: The reference ID of the transaction.
 *       500:
 *         description: Internal server error while processing the transaction creation.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Merchant not found
 */
paymentRouter.get('/payment/:merchantId/:amount', paymentController.createTransaction);

/**
 * @swagger
 * /payments/status/{referenceId}:
 *   get:
 *     summary: Check the payment status
 *     description: Retrieves the status of a payment transaction using the reference ID, returns the current status
 *     tags:
 *       - V1 Payment
 *     operationId: checkPaymentStatus
 *     parameters:
 *       - in: path
 *         name: referenceId
 *         required: true
 *         description: The reference ID of the payment transaction.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Payment status retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   description: The status of the payment transaction.
 *                   enum:
 *                     - IN_PROGRESS
 *                     - DONE
 *       500:
 *         description: Internal server error while checking payment status.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: No Response yet
 */
paymentRouter.get('/status/:referenceId', paymentController.checkPaymentStatus);

export default paymentRouter;
