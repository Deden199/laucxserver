// src/middleware/clientAuth.ts
import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { config } from '../config'

export interface ClientAuthRequest extends Request {
  clientUserId?: string
}

export function requireClientAuth(req: ClientAuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  console.log('[ClientAuth] Authorization header:', header)

  if (!header || !header.startsWith('Bearer ')) {
    console.log('[ClientAuth] Missing or malformed Authorization header')
    return res.status(401).json({ error: 'Missing or malformed Authorization header' })
  }

  const token = header.slice(7)
  try {
    const payload: any = jwt.verify(token, config.api.jwtSecret)
    console.log('[ClientAuth] JWT payload:', payload)
    if (payload.role !== 'PARTNER_CLIENT') {
      console.log('[ClientAuth] Invalid role:', payload.role)
      return res.status(401).json({ error: 'Invalid role' })
    }
    req.clientUserId = payload.sub
    next()
  } catch (err: any) {
    console.log('[ClientAuth] JWT verify error:', err.message)
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}
