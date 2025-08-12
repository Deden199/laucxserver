import { Request, Response } from 'express'
import cron from 'node-cron'
import { prisma } from '../core/prisma'
import { setWeekendOverrideDates } from '../util/time'
import { AuthRequest } from '../middleware/auth'
import { logAdminAction } from '../util/adminLog'
import { rescheduleSettlementCron } from '../cron/settlement'

export async function getSettings(req: Request, res: Response) {
  const rows = await prisma.setting.findMany()
  const obj: Record<string,string> = {}
  rows.forEach(r => { obj[r.key] = r.value })
  if (!obj['settlement_cron']) {
    obj['settlement_cron'] = '0 16 * * *'
  }
  res.json({ data: obj })
}

export async function updateSettings(req: AuthRequest, res: Response) {
  const updates: Record<string,string> = req.body
  if (
    updates['settlement_cron'] !== undefined &&
    !cron.validate(updates['settlement_cron'])
  ) {
    return res.status(400).json({ error: 'Invalid cron expression' })
  }

  const tx = await prisma.$transaction(
    Object.entries(updates).map(([key,value]) =>
      prisma.setting.upsert({
        where: { key },
        update: { value },
        create: { key, value }
      })
    )
  )
  if (updates['weekend_override_dates'] !== undefined) {
    const dates = updates['weekend_override_dates']
      .split(',')
      .map(d => d.trim())
      .filter(Boolean)
    setWeekendOverrideDates(dates)
  }
  if (updates['settlement_cron'] !== undefined) {
    await rescheduleSettlementCron()
  }
  if (req.userId) {
    await logAdminAction(req.userId, 'updateSettings', 'settings', updates)
  }
  res.json({ data: tx })
}
