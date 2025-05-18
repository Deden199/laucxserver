// src/middleware/apiKeyAuth.ts
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../core/prisma';

export default async function apiKeyAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const gotKey = req.get('x-api-key');
  if (!gotKey) {
    return res.status(401).json({ message: 'Missing API key' });
  }

  const client = await prisma.partnerClient.findUnique({
    where: { apiKey: gotKey },
  });
  if (!client || !client.isActive) {
    return res.status(401).json({ message: 'Invalid or inactive API key' });
  }

  // OK
  (req as any).clientId = client.id;
  next();
}
