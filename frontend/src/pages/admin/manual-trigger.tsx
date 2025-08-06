'use client'

import { useEffect, useRef, useState } from 'react'
import api from '@/lib/api'
import { useRequireAuth } from '@/hooks/useAuth'

interface Status {
  running: boolean
  current: number
  total: number
  settledOrders: number
  netAmount: number
  done: boolean
  error?: string
}

export default function ManualTriggerPage() {
  useRequireAuth()
  const [status, setStatus] = useState<Status>({
    running: false,
    current: 0,
    total: 0,
    settledOrders: 0,
    netAmount: 0,
    done: false
  })
  const pollRef = useRef<NodeJS.Timer | null>(null)

  const start = async () => {
    try {
      await api.post('/admin/settlement/run')
      setStatus(s => ({ ...s, running: true, done: false, error: undefined }))
      pollRef.current = setInterval(async () => {
        try {
          const r = await api.get<Status>('/admin/settlement/status')
          setStatus(r.data)
          if (r.data.done) {
            clearInterval(pollRef.current!)
            pollRef.current = null
          }
        } catch (e: any) {
          clearInterval(pollRef.current!)
          pollRef.current = null
          setStatus(s => ({ ...s, running: false, error: 'Failed to fetch status' }))
        }
      }, 1000)
    } catch (e: any) {
      setStatus(s => ({ ...s, running: false, error: 'Failed to start process' }))
    }
  }

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  return (
    <div className="p-8 space-y-4">
      <h1 className="text-2xl font-bold">Manual Settlement Trigger</h1>
      {status.error && <div className="text-red-600">{status.error}</div>}
      <button
        onClick={start}
        disabled={status.running}
        className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
      >
        {status.running ? 'Running…' : 'Run Settlement'}
      </button>
      {status.running && (
        <div className="space-y-2">
          <progress value={status.current} max={status.total || 1} className="w-full" />
          <p>
            Batch {status.current}/{status.total} – Settled {status.settledOrders} orders, Net {status.netAmount}
          </p>
        </div>
      )}
      {status.done && !status.error && (
        <div className="text-green-700">
          Completed: settled {status.settledOrders} orders, net amount {status.netAmount}
        </div>
      )}
    </div>
  )
}
