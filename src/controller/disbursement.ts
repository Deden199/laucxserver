import { Request, Response } from 'express';
import { createErrorResponse, createSuccessResponse } from '../util/response';
import disbursementService from '../service/disbursement';

const transactionCallback = async (req: Request, res: Response) => {
  try {
    const callbackResponse = await disbursementService.transactionCallback(req);
    return res.status(201).json(createSuccessResponse('Transaction stored successfully'));
  } catch (error) {
    return res.status(500).json(createErrorResponse('Processing failed'));
  }
};


const disbursementController = {
    transactionCallback,
};
  
export default disbursementController;