// src/controllers/transactions.controller.ts
import { Request, Response } from 'express'
import { prisma } from '../core/prisma'
import { syncWithHilogate } from '../service/hilogate.service'

export async function listTransactions(req: Request, res: Response) {
  const { ref_id, merchantId, status, date_from, date_to, page = 1, limit = 20 } = req.query
  const where: any = {}
  if (ref_id)     where.id = { contains: ref_id as string }
  if (merchantId) where.merchantId = merchantId as string
  if (status)     where.status = status as string
  if (date_from || date_to) {
    where.createdAt = {}
    if (date_from) where.createdAt.gte = new Date(date_from as string)
    if (date_to)   where.createdAt.lte = new Date(date_to as string)
  }
  const data = await prisma.transaction_request.findMany({
    where,
    skip: (Number(page) - 1) * Number(limit),
    take: Number(limit),
    orderBy: { createdAt: 'desc' },
  })
  const total = await prisma.transaction_request.count({ where })
  res.json({ data, total })
}

export async function syncTransaction(req: Request, res: Response) {
  const { ref_id } = req.params
  try {
    const updated = await syncWithHilogate(ref_id)
    res.json({ success: true, updated })
  } catch (err: any) {
    res.status(500).json({ message: err.message })
  }
}
