import disbursementController from '../controller/disbursement';
import { Router } from 'express';

const disbursementRouter = Router();

/**
 * @swagger
 * /disbursements/disbursement/callback:
 *   post:
 *     summary: Store disbursement callback
 *     description: Receives the disbursement callback, stores the data, and updates the transaction status.
 *     tags:
 *     - V1 Disbursement
 *     requestBody:
 *       description: Callback data from the disbursement service.
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               partnerReferenceNo:
 *                 type: string
 *                 description: Reference ID for the disbursement transaction.
 *     responses:
 *       201:
 *         description: Transaction successfully stored.
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
disbursementRouter.post('/disbursement/callback', disbursementController.transactionCallback);

export default disbursementRouter;
