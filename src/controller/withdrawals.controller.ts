// src/controllers/withdrawals.controller.ts
import { Request, Response } from 'express'
import { prisma } from '../core/prisma'
import { retryDisbursement } from '../service/hilogate.service'

export async function listWithdrawals(req: Request, res: Response) {
  const { status, date_from, date_to, page = 1, limit = 20 } = req.query
  const where: any = {}
  if (status) where.status = status as string
  if (date_from || date_to) {
    where.createdAt = {}
    if (date_from) where.createdAt.gte = new Date(date_from as string)
    if (date_to)   where.createdAt.lte = new Date(date_to as string)
  }
  const data = await prisma.disbursement.findMany({
    where,
    skip: (Number(page) - 1) * Number(limit),
    take: Number(limit),
    orderBy: { createdAt: 'desc' },
  })
  const total = await prisma.disbursement.count({ where })
  res.json({ data, total })
}

export async function retryWithdrawal(req: Request, res: Response) {
  const { id } = req.params
  try {
    const result = await retryDisbursement(id)
    res.json({ success: true, result })
  } catch (err: any) {
    res.status(500).json({ message: err.message })
  }
}
