// src/route/disbursement.routes.ts

import { Router } from 'express';
import disbursementController from '../controller/disbursement';

const disbursementRouter = Router();

/**
 * @swagger
 * tags:
 *   - name: V1 Disbursement
 *     description: Disbursement API v1
 */

/**
 * @swagger
 * /disbursements/disbursement:
 *   post:
 *     summary: Create a disbursement
 *     tags:
 *       - V1 Disbursement
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DisbursementRequest'
 *     responses:
 *       '200':
 *         description: Disbursement created successfully.
 */
disbursementRouter.post(
  '/disbursement',
  disbursementController.createWithdrawal
);

/**
 * @swagger
 * /disbursements/disbursement/callback:
 *   post:
 *     summary: Store disbursement callback
 *     tags:
 *       - V1 Disbursement
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DisbursementCallback'
 *     responses:
 *       '201':
 *         description: Transaction stored successfully.
 *       '400':
 *         description: Invalid signature.
 */
disbursementRouter.post(
  '/disbursement/callback',
  disbursementController.transactionCallback
);

/**
 * @swagger
 * /disbursements/balance:
 *   get:
 *     summary: Get merchant balance
 *     tags:
 *       - V1 Disbursement
 *     responses:
 *       '200':
 *         description: Balance retrieved successfully.
 */
disbursementRouter.get(
  '/balance',
  disbursementController.getBalance
);

export default disbursementRouter;
