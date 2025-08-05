import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { runSettlementBatch } from '../../service/settlementBatch';

// Trigger settlement batch run manually by admin
export async function runBatch(req: AuthRequest, res: Response) {
  try {
    const adminId = req.userId || 'unknown';
    const result = await runSettlementBatch(adminId);
    res.json(result);
  } catch (err: any) {
    // surface error to caller
    res.status(500).json({ error: err.message || 'Failed to run settlement batch' });
  }
}
