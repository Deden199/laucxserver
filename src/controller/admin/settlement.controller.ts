import { Request, Response } from 'express'
import { runSettlementManual } from '../../cron/settlement'

interface Progress {
  running: boolean
  current: number
  total: number
  settledOrders: number
  netAmount: number
  done: boolean
  error?: string
}

let progress: Progress = {
  running: false,
  current: 0,
  total: 0,
  settledOrders: 0,
  netAmount: 0,
  done: false,
}

export async function run(req: Request, res: Response) {
  if (progress.running) return res.status(400).json({ message: 'Settlement already running' })
  progress = { running: true, current: 0, total: 0, settledOrders: 0, netAmount: 0, done: false }
  res.json({ started: true })

  try {
    await runSettlementManual(info => {
      progress.current = info.batch
      progress.total = info.total
      progress.settledOrders = info.settledOrders
      progress.netAmount = info.netAmount
    })
    progress.running = false
    progress.done = true
  } catch (err: any) {
    progress.running = false
    progress.done = true
    progress.error = err?.message || 'unknown error'
  }
}

export function status(req: Request, res: Response) {
  res.json(progress)
}
