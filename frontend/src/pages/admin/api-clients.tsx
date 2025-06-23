/* Admin – Partner Client & API Key */
import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { useRequireAuth } from '@/hooks/useAuth'

type Client = { id: string; name: string; apiKey: string }

export default function APIClientsPage() {
  useRequireAuth()
  const [clients, setClients] = useState<Client[]>([])
  const [name, setName] = useState('')

  useEffect(() => { api.get<Client[]>('/admin/api-clients').then(r => setClients(r.data)) }, [])

  const create = async () => {
    if (!name.trim()) return
    const r = await api.post<Client>('/admin/api-clients', { name })
    setClients(cl => [...cl, r.data])
    setName('')
  }

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-4">Partner Clients</h1>

      <div className="flex mb-6 space-x-2">
        <input value={name} onChange={e => setName(e.target.value)}
          className="border px-3 py-2 rounded w-60" placeholder="Client name" />
        <button onClick={create} className="px-4 py-2 bg-blue-600 text-white rounded">Create</button>
      </div>

      <table className="w-full bg-white shadow rounded">
        <thead className="bg-gray-100">
          <tr><th className="px-4 py-2 text-left">Name</th><th className="px-4 py-2 text-left">API Key</th></tr>
        </thead>
        <tbody>
          {clients.map(c => (
            <tr key={c.id} className="border-t">
              <td className="px-4 py-2">{c.name}</td>
              <td className="px-4 py-2 break-all">{c.apiKey}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
