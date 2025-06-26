// src/middleware/clientAuth.ts
import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { config } from '../config'

export interface ClientAuthRequest extends Request {
  clientUserId?: string
}

/**
 * Middleware to verify Partner Client JWT.
 */
export function requireClientAuth(
  req: ClientAuthRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const token = authHeader.slice(7)
  let payload: any
  try {
    payload = jwt.verify(token, config.api.jwtSecret) as Record<string, any>
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  if (typeof payload.sub !== 'string') {
    return res.status(401).json({ error: 'Invalid token subject' })
  }

  // Attach client user ID for downstream handlers
  req.clientUserId = payload.sub
  next()
}
