/* ─────────────────── src/route/payment.routes.ts ─────────────────── */
import { Router } from 'express';
import paymentController from '../controller/payment';
import apiKeyAuth from '../middleware/apiKeyAuth'

const paymentRouter = Router();

/* ─── 1. Create Order (aggregator) ───────────────────────────────── */
/**
 * @swagger
 * /api/v1/payments/create-order:
 *   post:
 *     summary: Create a new payment order (aggregator flow)
 *     tags: [V1 Payment]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/OrderRequest'
 *     responses:
 *       201:
 *         description: Order created
 */
paymentRouter.post('/create-order',apiKeyAuth, paymentController.createOrder);

/* ─── 2. Create Transaction (direct) ───────────────────────────────── */
/**
 * @swagger
 * /api/v1/payments:
 *   post:
 *     summary: Create a payment transaction (QR / checkout URL)
 *     tags: [V1 Payment]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount, userId]
 *             properties:
 *               amount:
 *                 type: number
 *                 example: 100000
 *               userId:
 *                 type: string
 *                 example: USER123
 *               merchantId:
 *                 type: string
 *                 example: gv
 *                 description: optional
 *     responses:
 *       201:
 *         description: Transaction created
 */
paymentRouter.post('/', paymentController.createTransaction);

/* ─── 3. Callback from payment gateway ─────────────────────────────── */
/**
 * @swagger
 * /api/v1/payments/transaction/callback:
 *   post:
 *     summary: Handle transaction callback (2C2P / Netz / GV)
 *     tags: [V1 Payment]
 *     responses:
 *       200:
 *         description: Callback processed
 */
paymentRouter.post('/transaction/callback', paymentController.transactionCallback);

/* ─── 4. Get Order Detail ──────────────────────────────────────────── */
/**
 * @swagger
 * /api/v1/payments/order/{id}:
 *   get:
 *     summary: Get order detail by ID (QR payload, amount, channel)
 *     tags: [V1 Payment]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Order detail
 *       404:
 *         description: Order not found
 */
paymentRouter.get('/order/:id', paymentController.getOrder);

/* ─── 5. Check Order Status ────────────────────────────────────────── */
/**
 * @swagger
 * /api/v1/payments/order/{id}/status:
 *   get:
 *     summary: Check payment status by order ID
 *     tags: [V1 Payment]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Status returned
 *       404:
 *         description: Order not found
 */
paymentRouter.get('/order/:id/status', paymentController.checkPaymentStatus);

export default paymentRouter;
