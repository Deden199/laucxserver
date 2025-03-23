import { Request } from 'express';
import { prisma } from '../core/prisma';
import logger from '../logger';
import {DisbursementStatus} from "@prisma/client";
import {
  AccountDetailsResponse,
  DisbursementRequest,
  DisbursementResponse,
  DisbursementStatusResponse
} from "../schema/types/disbursement";


const transactionCallback = async (request: Request) => {
  let referenceId;
  try {
    // Extract the entire request body
    const requestBody = request.body || {};

    // Store the entire body in the database using Prisma
    const newTransaction = await prisma.disbursement_callback.create({
      data: {
        referenceId: requestBody.partnerReferenceNo || null,
        requestBody: requestBody, // Store the entire request body as JSON
      },
    });
    referenceId = requestBody.partnerReferenceNo
  } catch (error) {
    // Handle errors and send an error response
    logger.error('Error storing disbursement callback:', error);
    throw new Error('Error storing disbursement callback::' + error);
  }

  try {
    if (referenceId) {
      const withdrawal = await prisma.disbursement.update({
        where: {id: referenceId},
        data: {status: DisbursementStatus.COMPLETED}
      });
    }
    console.log("Withdrawal updated to COMPLETED:", referenceId);
  } catch (error) {
    console.error("Error creating withdrawal:", error);
  }
  return;
};

const createDisbursement =  async (disbursementRequest: DisbursementRequest): Promise<DisbursementResponse> => {
  return {
    disbursementId: "mock_disbursement_id_123",
    status: "PENDING",
    amount: disbursementRequest.amount,
    recipientAccount: disbursementRequest.recipientAccount,
    bankCode: disbursementRequest.bankCode,
    currency: disbursementRequest.currency,
    description: disbursementRequest.description || null,
    requestId: disbursementRequest.requestId
  };
}

const getDisbursementStatus = async (disbursementId: string): Promise<DisbursementStatusResponse> => {
    return {
      disbursementId: "mock_disbursement_id_123",
      status: "SUCCESS",
      amount: 1000,
      recipientAccount: "1234567890",
      bankCode: "BANK001",
      currency: "USD",
      description: "Mock disbursement description",
      requestId: "a346a673-8a66-4719-a207-237af487996d"
    };
}

const checkAccount = async (bankCode: string, accountNumber: string): Promise<AccountDetailsResponse> => {
    return {
      accountNumber: "1234567890",
      bankCode: "BANK001",
      accountName: "John Doe",
  }
}




const disbursementService = {
  transactionCallback,
  createDisbursement,
  getDisbursementStatus,
  checkAccount
};
export default disbursementService;
