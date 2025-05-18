import { Request, Response, NextFunction } from 'express'
import crypto from 'crypto'
import { prisma } from '../core/prisma'

export interface APIKeyRequest extends Request {
  clientId?: string
}

// Cara sederhana:  
// - Client kirim header: X-API-KEY: <apiKey>
// - X-SIGNATURE: HMAC_SHA256(apiSecret, timestamp + path + body)
// - X-TIMESTAMP: dalam millis

export async function apiKeyAuth(
  req: APIKeyRequest,
  res: Response,
  next: NextFunction
) {
  const apiKey = req.headers['x-api-key'] as string
  const signature = req.headers['x-signature'] as string
  const timestamp = req.headers['x-timestamp'] as string

  if (!apiKey || !signature || !timestamp) {
    return res.status(401).json({ message: 'Missing API credentials' })
  }

  // Cegah replay attack: batas selisih max 5 menit
  const now = Date.now()
  if (Math.abs(now - Number(timestamp)) > 5 * 60 * 1000) {
    return res.status(401).json({ message: 'Timestamp invalid' })
  }

  const client = await prisma.partnerClient.findUnique({ where: { apiKey } })
  if (!client || !client.isActive) {
    return res.status(401).json({ message: 'Invalid API key' })
  }

  // Rekonstruksi payload untuk verifikasi signature
  const payload = `${timestamp}:${req.method}:${req.originalUrl}:${JSON.stringify(req.body)}`
  const hmac = crypto.createHmac('sha256', client.apiSecret)
  hmac.update(payload)
  const expectedSig = hmac.digest('hex')

  if (!crypto.timingSafeEqual(Buffer.from(expectedSig), Buffer.from(signature))) {
    return res.status(401).json({ message: 'Invalid signature' })
  }

  // Lolos verifikasi
  req.clientId = client.id
  next()
}
