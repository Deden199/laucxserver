import { Request, Response } from 'express'
import { prisma } from '../core/prisma'
import { retryDisbursement } from '../service/hilogate.service'

// List withdrawal requests (WithdrawRequest)
export async function listWithdrawals(req: Request, res: Response) {
  const { status, date_from, date_to, page = 1, limit = 20 } = req.query
  const where: any = {}
  if (status) where.status = status as string
  if (date_from || date_to) {
    where.createdAt = {}
    if (date_from) where.createdAt.gte = new Date(date_from as string)
    if (date_to)   where.createdAt.lte = new Date(date_to as string)
  }
  const pageNum = Number(page)
  const pageSize = Number(limit)

  const data = await prisma.withdrawRequest.findMany({
    where,
    skip: (pageNum - 1) * pageSize,
    take: pageSize,
    orderBy: { createdAt: 'desc' },
  })
  const total = await prisma.withdrawRequest.count({ where })
  res.json({ data, total })
}

// Retry a failed withdrawal by invoking Hilogate resend-callback
export async function retryWithdrawal(req: Request, res: Response) {
  const { id } = req.params
  try {
    const result = await retryDisbursement(id)
    res.json({ success: true, result })
  } catch (err: any) {
    res.status(500).json({ message: err.message })
  }
}

// Callback handler for Hilogate withdrawal status updates
export async function withdrawalCallback(req: Request, res: Response) {
  try {
    const raw = (req as any).rawBody.toString()
    const payload = JSON.parse(raw)
    const { ref_id, status, net_amount, completed_at } = payload.data

    await prisma.withdrawRequest.update({
      where: { refId: ref_id },
      data: {
        status,
        netAmount: net_amount,
        completedAt: new Date(completed_at),
      },
    })

    res.sendStatus(200)
  } catch (error) {
    res.status(400).json({ message: 'Invalid callback payload' })
  }
}
