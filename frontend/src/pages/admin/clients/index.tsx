'use client'

import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { useRequireAuth } from '@/hooks/useAuth'
import styles from './apiClients.module.css'

interface Client {
  id: string
  name: string
  apiKey: string
  apiSecret: string
  isActive: boolean
  feePercent: number
  feeFlat: number
}

type CreateResp = {
  client: Client
  defaultUser: { email: string; password: string }
}

export default function ApiClientsPage() {
  useRequireAuth()

  const [clients, setClients]             = useState<Client[]>([])
  const [newName, setNewName]             = useState('')
  const [newEmail, setNewEmail]           = useState('')
  const [newFeePercent, setNewFeePercent] = useState<number>(0.5)
  const [newFeeFlat, setNewFeeFlat]       = useState<number>(0)
  const [err, setErr]                     = useState('')
  const [loading, setLoading]             = useState(false)
  const [creds, setCreds]                 = useState<CreateResp | null>(null)

  useEffect(() => {
    loadClients()
  }, [])

  async function loadClients() {
    try {
      const res = await api.get<Client[]>('/admin/clients')
      setClients(res.data)
    } catch {
      setErr('Gagal memuat daftar client')
    }
  }

  async function addClient() {
    if (!newName.trim() || !newEmail.trim()) {
      setErr('Nama dan email tidak boleh kosong')
      return
    }
    setErr('')
    setLoading(true)
    try {
      const res = await api.post<CreateResp>('/admin/clients', {
        name:       newName.trim(),
        email:      newEmail.trim(),
        feePercent: newFeePercent,
        feeFlat:    newFeeFlat,
      })
      setClients(cs => [res.data.client, ...cs])
      setCreds(res.data)
      setNewName('')
      setNewEmail('')
      setNewFeePercent(0.5)
      setNewFeeFlat(0)
    } catch (e: any) {
      setErr(e.response?.data?.error || 'Gagal menambah client')
    } finally {
      setLoading(false)
    }
  }

  function copy(txt: string) {
    navigator.clipboard.writeText(txt)
      .then(() => alert('Disalin!'))
      .catch(() => alert('Gagal menyalin'))
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.heading}>API Clients</h1>

      <div className={styles.formRow}>
        <input
          className={styles.input}
          placeholder="Nama client baru"
          value={newName}
          onChange={e => setNewName(e.target.value)}
        />
        <input
          className={styles.input}
          placeholder="Email partner"
          type="email"
          value={newEmail}
          onChange={e => setNewEmail(e.target.value)}
        />
        <input
          className={styles.input}
          placeholder="Fee %"
          type="number"
          step="0.1"
          min={0}
          max={100}
          value={newFeePercent}
          onChange={e => setNewFeePercent(parseFloat(e.target.value) || 0)}
        />
        <input
          className={styles.input}
          placeholder="Fee flat"
          type="number"
          step="0.01"
          min={0}
          value={newFeeFlat}
          onChange={e => setNewFeeFlat(parseFloat(e.target.value) || 0)}
        />
        <button
          className={styles.btnAdd}
          onClick={addClient}
          disabled={loading}
        >
          {loading ? 'Menambahkan…' : 'Tambah Client'}
        </button>
      </div>

      {err && <div className={styles.error}>{err}</div>}

      {creds && (
        <div className={styles.popup}>
          <h3>Default Partner Credentials</h3>
          <p>Email: <code>{creds.defaultUser.email}</code></p>
          <p>Password: <code>{creds.defaultUser.password}</code></p>
          <button onClick={() => setCreds(null)}>Tutup</button>
        </div>
      )}

      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>API Key</th>
              <th>API Secret</th>
              <th>Fee %</th>
              <th>Fee Flat</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {clients.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center p-4 text-gray-500">
                  Belum ada client
                </td>
              </tr>
            ) : (
              clients.map(c => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td className="font-mono text-sm">
                    {c.apiKey}
                    <button className={styles.copyBtn} onClick={() => copy(c.apiKey)}>Copy</button>
                  </td>
                  <td className="font-mono text-sm">
                    {c.apiSecret}
                    <button className={styles.copyBtn} onClick={() => copy(c.apiSecret)}>Copy</button>
                  </td>
                  <td>{c.feePercent.toFixed(1)}</td>
                  <td>{c.feeFlat.toFixed(2)}</td>
                  <td>
                    <a
                      className="text-blue-600 hover:underline"
                      href={`/admin/clients/${c.id}`}
                    >
                      Manage
                    </a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
)
}
