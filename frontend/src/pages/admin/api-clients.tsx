/* frontend/src/pages/admin/api-clients.tsx */

import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { useRequireAuth } from '@/hooks/useAuth'

type Client = {
  id:           string
  name:         string
  apiKey:       string
  feePercent:   number
  feeFlat:      number
}

export default function APIClientsPage() {
  useRequireAuth()

  const [clients, setClients]       = useState<Client[]>([])
  const [name, setName]             = useState('')
  const [feePercent, setFeePercent] = useState(0.5)
  const [feeFlat, setFeeFlat]       = useState(0)

  useEffect(() => {
    api.get<Client[]>('/admin/api-clients')
      .then(r => setClients(r.data))
      .catch(console.error)
  }, [])

  const create = async () => {
    if (!name.trim()) return
    // send fee fields too
    const payload = { name, feePercent, feeFlat }
    const r = await api.post<Client>('/admin/api-clients', payload)
    setClients(cl => [...cl, r.data])
    setName('')
    setFeePercent(0.5)
    setFeeFlat(0)
  }

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-4">Partner Clients</h1>

      <div className="flex mb-6 space-x-2">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          className="border px-3 py-2 rounded w-48"
          placeholder="Client name"
        />
        <input
          type="number"
          step="0.1"
          min={0}
          max={100}
          value={feePercent}
          onChange={e => setFeePercent(parseFloat(e.target.value))}
          className="border px-3 py-2 rounded w-32"
          placeholder="Fee %"
        />
        <input
          type="number"
          step="0.01"
          min={0}
          value={feeFlat}
          onChange={e => setFeeFlat(parseFloat(e.target.value))}
          className="border px-3 py-2 rounded w-32"
          placeholder="Fee flat"
        />
        <button
          onClick={create}
          className="px-4 py-2 bg-blue-600 text-white rounded"
        >
          Create
        </button>
      </div>

      <table className="w-full bg-white shadow rounded">
        <thead className="bg-gray-100">
          <tr>
            <th className="px-4 py-2 text-left">Name</th>
            <th className="px-4 py-2 text-left">API Key</th>
            <th className="px-4 py-2 text-left">Fee %</th>
            <th className="px-4 py-2 text-left">Fee Flat</th>
          </tr>
        </thead>
        <tbody>
          {clients.map(c => (
            <tr key={c.id} className="border-t">
              <td className="px-4 py-2">{c.name}</td>
              <td className="px-4 py-2 break-all">{c.apiKey}</td>
              <td className="px-4 py-2">{c.feePercent.toFixed(1)}</td>
              <td className="px-4 py-2">{c.feeFlat.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
