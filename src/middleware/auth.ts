// src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { prisma } from '../core/prisma'

const JWT_SECRET = process.env.JWT_SECRET!

export interface AuthRequest extends Request {
  userId?: string
}

export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ message: 'Unauthorized' })
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string }
    const user = await prisma.partnerUser.findUnique({ where: { id: payload.userId } })
    if (!user || !user.isActive) return res.status(401).json({ message: 'Unauthorized' })
    req.userId = payload.userId
    next()
  } catch {
    return res.status(401).json({ message: 'Unauthorized' })
  }
}
