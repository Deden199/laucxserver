'use client'

import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { useRequireAuth } from '@/hooks/useAuth'
import styles from './pg.module.css'

type PGProvider = {
  id: string
  name: string
  credentials: { partnerId: string }
}

type ClientPGRaw = {
  id: string
  pgProviderId: string
  clientFee: number
  activeDays: string[]
}

type ClientPG = ClientPGRaw & {
  pgProvider: PGProvider | null
}

type ClientInfo = { id: string; name: string }

export default function ClientPGPage() {
  useRequireAuth()
  const { query } = useRouter()
  const clientId = Array.isArray(query.clientId) ? query.clientId[0] : query.clientId

  const [client, setClient]       = useState<ClientInfo | null>(null)
  const [providers, setProviders] = useState<PGProvider[]>([])
  const [conns, setConns]         = useState<ClientPG[]>([])
  const [selectedProv, setSelectedProv] = useState('')
  const [fee, setFee]             = useState('')
  const [days, setDays]           = useState<string[]>([])
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState('')
  const [loading, setLoading]     = useState(false)

  // 1) Load client name
  useEffect(() => {
    if (!clientId) return
    api.get<ClientInfo>(`/admin/clients/${clientId}`)
      .then(r => setClient(r.data))
      .catch(() => setClient({ id: clientId, name: '—' }))
  }, [clientId])

  // 2) Load providers once
  useEffect(() => {
    if (!clientId) return
    api.get<PGProvider[]>(`/admin/pg-providers`)
      .then(r => {
        setProviders(r.data)
        if (r.data[0]) setSelectedProv(r.data[0].id)
      })
      .catch(console.error)
  }, [clientId])

  // 3) Fetch connections whenever providers ready
  useEffect(() => {
    if (!clientId || providers.length === 0) return
    fetchConns()
  }, [clientId, providers])

  // clear success message
  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(''), 3000)
      return () => clearTimeout(t)
    }
  }, [success])

  function fetchConns() {
    api.get<ClientPGRaw[]>(`/admin/clients/${clientId}/pg`, {
      validateStatus: status => (status >= 200 && status < 300) || status === 304,
      headers: { 'Cache-Control': 'no-cache' },
    })
    .then(r => {
      if (r.status === 200) {
        // merge raw conn + provider info
        const merged: ClientPG[] = r.data.map(c => ({
          ...c,
          pgProvider: providers.find(p => p.id === c.pgProviderId) || null
        }))
        setConns(merged)
      }
    })
    .catch(err => {
      console.error('fetchConns error', err)
    })
  }

  const toggleDay = (d: string) => {
    setDays(ds => ds.includes(d) ? ds.filter(x => x !== d) : [...ds, d])
  }

  const createConn = async () => {
    if (!selectedProv || !fee || days.length === 0) {
      setError('Pilih gateway, fee & minimal 1 hari aktif')
      return
    }
    setError(''); setSuccess(''); setLoading(true)
    try {
      await api.post(`/admin/clients/${clientId}/pg`, {
        pgProviderId: selectedProv,
        clientFee: Number(fee),
        activeDays: days
      })
      setSuccess('Connection berhasil ditambahkan!')
      fetchConns()
      setFee(''); setDays([])
    } catch (e: any) {
      setError(e.response?.data?.error || 'Gagal membuat koneksi')
    } finally {
      setLoading(false)
    }
  }

  const updateConn = async (id: string) => {
    const val = prompt('Masukkan fee baru (%)')
    if (val == null) return
    const nf = Number(val)
    if (isNaN(nf)) { alert('Fee harus angka'); return }
    await api.patch(`/admin/clients/${clientId}/pg/${id}`, { clientFee: nf })
    setSuccess('Connection berhasil diupdate!')
    fetchConns()
  }

  const deleteConn = async (id: string) => {
    if (!confirm('Yakin ingin menghapus?')) return
    await api.delete(`/admin/clients/${clientId}/pg/${id}`)
    setSuccess('Connection berhasil dihapus!')
    fetchConns()
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>
        Client {client?.name || clientId} — PG Connections
      </h1>

      {error   && <div className={styles.error}>{error}</div>}
      {success && <div className={styles.success}>{success}</div>}

      <div className={styles.form}>
        <select
          className={styles.select}
          value={selectedProv}
          onChange={e => setSelectedProv(e.target.value)}
        >
          {providers.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        <input
          className={styles.input}
          type="number"
          placeholder="Fee (%)"
          value={fee}
          onChange={e => setFee(e.target.value)}
        />

        <div className={styles.days}>
          {['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY']
            .map(d => (
              <label key={d} className={styles.dayLabel}>
                <input
                  type="checkbox"
                  checked={days.includes(d)}
                  onChange={() => toggleDay(d)}
                /> {d.slice(0,3)}
              </label>
          ))}
        </div>

        <button
          className={styles.btn}
          onClick={createConn}
          disabled={loading}
        >
          {loading ? 'Adding…' : 'Add Connection'}
        </button>
      </div>

      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Provider</th>
              <th>PartnerID</th>
              <th>Fee %</th>
              <th>Active Days</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {conns.map(c => (
              <tr key={c.id}>
                <td>{c.pgProvider?.name || c.pgProviderId}</td>
                <td>{c.pgProvider?.credentials.partnerId || '—'}</td>
                <td>{c.clientFee}</td>
                <td>{c.activeDays.map(d => d.slice(0,3)).join(', ')}</td>
                <td className={styles.actions}>
                  <button className={styles.editBtn} onClick={() => updateConn(c.id)}>Edit</button>
                  <button className={styles.delBtn} onClick={() => deleteConn(c.id)}>Delete</button>
                </td>
              </tr>
            ))}
            {conns.length === 0 && (
              <tr>
                <td colSpan={5} className={styles.empty}>No connections</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
