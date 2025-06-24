import { Request, Response } from 'express';
import { prisma } from '../core/prisma';

export const withdrawalCallback = async (req: Request, res: Response) => {
  const payload = JSON.parse((req as any).rawBody.toString());
  const { ref_id, status, net_amount, completed_at } = payload.data;

  await prisma.withdrawRequest.update({
    where: { refId: ref_id },
    data: {
      status,               // “COMPLETED” atau “FAILED”
      netAmount: net_amount,
      completedAt: new Date(completed_at),
    },
  });
  res.sendStatus(200);
};
