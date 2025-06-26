
// src/middleware/apiKeyAuth.ts
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { prisma } from '../core/prisma';

export interface ApiKeyRequest extends Request {
  clientId?: string;
}

/**
 * API Key middleware with timestamp validation and secure comparison.
 * Expects headers:
 * - X-API-Key: <apiKey>
 * - X-Timestamp: <epoch ms>
 */
export default async function apiKeyAuth(
  req: ApiKeyRequest,
  res: Response,
  next: NextFunction
) {
  const gotKey = req.header('X-API-Key');
  const ts     = req.header('X-Timestamp');

  // 1) Headers must be present
  if (!gotKey || !ts) {
    return res.status(401).json({ error: 'Missing API key or timestamp' });
  }

  // 2) Validate timestamp skew (±5 minutes)
  const timestamp = parseInt(ts, 10);
  const SKEW = 5 * 60 * 1000; // 5 minutes in ms
  if (
    isNaN(timestamp) ||
    Math.abs(Date.now() - timestamp) > SKEW
  ) {
    return res.status(400).json({ error: 'Invalid or expired timestamp' });
  }

  // 3) Lookup client by apiKey
  const client = await prisma.partnerClient.findUnique({
    where: { apiKey: gotKey },
    select: { id: true, apiKey: true, isActive: true }
  });

  if (!client || !client.isActive) {
    return res.status(401).json({ error: 'Invalid or inactive API key' });
  }

  // 4) Securely compare API keys to prevent timing attacks
  const valid = crypto.timingSafeEqual(
    Buffer.from(client.apiKey),
    Buffer.from(gotKey)
  );
  if (!valid) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  // Attach client context and proceed
  req.clientId = client.id;
  next();
}

