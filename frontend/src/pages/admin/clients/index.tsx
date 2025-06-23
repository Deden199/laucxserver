// src/pages/apiClients.tsx
'use client'

import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { useRequireAuth } from '@/hooks/useAuth'
import styles from './apiClients.module.css'

type Client = { id: string; name: string; apiKey: string; apiSecret: string; isActive: boolean }
type CreateResp = { client: Client; defaultUser: { email: string; password: string } }

export default function ApiClientsPage() {
  useRequireAuth()
  const [clients, setClients]     = useState<Client[]>([])
  const [newName, setNewName]     = useState('')
  const [newEmail, setNewEmail]   = useState('')
  const [err, setErr]             = useState('')
  const [loading, setLoading]     = useState(false)
  const [creds, setCreds]         = useState<CreateResp|null>(null)

  useEffect(() => { load() }, [])

  async function load() {
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
    setErr(''); setLoading(true)
    try {
      const res = await api.post<CreateResp>('/admin/clients', {
        name:  newName.trim(),
        email: newEmail.trim(),
      })
      // update tabel & tampilkan kredensial
      setClients(cs => [res.data.client, ...cs])
      setCreds(res.data)
      setNewName(''); setNewEmail('')
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
          <button onClick={()=>setCreds(null)}>Tutup</button>
        </div>
      )}

      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead><tr>
            <th>Name</th><th>API Key</th><th>API Secret</th><th>Actions</th>
          </tr></thead>
          <tbody>
            {clients.length===0
              ? <tr><td colSpan={4} className="text-center p-4 text-gray-500">Belum ada client</td></tr>
              : clients.map(c => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td className="font-mono text-sm">
                    {c.apiKey}
                    <button className={styles.copyBtn} onClick={()=>copy(c.apiKey)}>Copy</button>
                  </td>
                  <td className="font-mono text-sm">
                    {c.apiSecret}
                    <button className={styles.copyBtn} onClick={()=>copy(c.apiSecret)}>Copy</button>
                  </td>
                  <td>
                    <a className="text-blue-600 hover:underline" href={`/admin/clients/${c.id}/pg`}>
                      Manage
                    </a>
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </div>
  )
}
