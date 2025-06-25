'use client'

import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { useRequireAuth } from '@/hooks/useAuth'
import styles from './pg.module.css'

// Update types to include feePercent and feeFlat where needed
interface PGProvider {
  id: string
  name: string
  credentials: { partnerId: string }
}
interface ClientPGRaw {
  id: string
  pgProviderId: string
  clientFee: number  // numeric state now
  activeDays: string[]
}
interface ClientPG extends ClientPGRaw {
  pgProvider: PGProvider | null
}
interface ClientInfo {
  id: string
  name: string
}

export default function ClientPGPage() {
  useRequireAuth()
  const {
    query: { clientId }
  } = useRouter()
  const cid = Array.isArray(clientId) ? clientId[0] : clientId

  const [client, setClient]           = useState<ClientInfo | null>(null)
  const [providers, setProviders]     = useState<PGProvider[]>([])
  const [conns, setConns]             = useState<ClientPG[]>([])
  const [selectedProv, setSelectedProv] = useState<string>('')

  // fee is now number
  const [fee, setFee]                 = useState<number>(0)
  const [days, setDays]               = useState<string[]>([])
  const [error, setError]             = useState<string>('')
  const [success, setSuccess]         = useState<string>('')
  const [loading, setLoading]         = useState<boolean>(false)

  // Load client info
  useEffect(() => {
    if (!cid) return
    api.get<ClientInfo>(`/admin/clients/${cid}`)
      .then(r => setClient(r.data))
      .catch(() => setClient({ id: cid, name: '—' }))
  }, [cid])

  // Load providers
  useEffect(() => {
    if (!cid) return
    api.get<PGProvider[]>(`/admin/pg-providers`)
      .then(r => {
        setProviders(r.data)
        if (r.data.length) setSelectedProv(r.data[0].id)
      })
      .catch(console.error)
  }, [cid])

  // Fetch connections
  useEffect(() => {
    if (!cid || providers.length === 0) return
    fetchConns()
  }, [cid, providers])

  // clear success
  useEffect(() => {
    if (!success) return
    const t = setTimeout(() => setSuccess(''), 3000)
    return () => clearTimeout(t)
  }, [success])

  async function fetchConns() {
    try {
      const r = await api.get<ClientPGRaw[]>(`/admin/clients/${cid}/pg`, {
        validateStatus: status => (status >= 200 && status < 300) || status === 304,
        headers: { 'Cache-Control': 'no-cache' },
      })
      if (r.status === 200) {
        const merged = r.data.map(c => ({
          ...c,
          pgProvider: providers.find(p => p.id === c.pgProviderId) || null
        }))
        setConns(merged)
      }
    } catch (err) {
      console.error('fetchConns error', err)
    }
  }

  const toggleDay = (d: string) => {
    setDays(ds => ds.includes(d) ? ds.filter(x => x !== d) : [...ds, d])
  }

  const createConn = async () => {
    if (!selectedProv || fee <= 0 || days.length === 0) {
      setError('Pilih gateway, fee > 0 & minimal 1 hari aktif')
      return
    }
    setError(''); setSuccess(''); setLoading(true)
    try {
      await api.post(`/admin/clients/${cid}/pg`, {
        pgProviderId: selectedProv,
        clientFee: fee,
        activeDays: days
      })
      setSuccess('Connection berhasil ditambahkan!')
      fetchConns()
      setFee(0); setDays([])
    } catch (e: any) {
      setError(e.response?.data?.error || 'Gagal membuat koneksi')
    } finally {
      setLoading(false)
    }
  }

  const updateConn = async (id: string) => {
    // better UI than prompt: reuse create form? minimal update fee only
    const nf = fee
    if (nf <= 0) { alert('Fee harus > 0'); return }
    setLoading(true)
    try {
      await api.patch(`/admin/clients/${cid}/pg/${id}`, { clientFee: nf, activeDays: days })
      setSuccess('Connection berhasil diupdate!')
      fetchConns()
    } catch (e: any) {
      setError(e.response?.data?.error || 'Gagal mengupdate koneksi')
    } finally {
      setLoading(false)
    }
  }

  const deleteConn = async (id: string) => {
    if (!confirm('Yakin ingin menghapus?')) return
    setLoading(true)
    try {
      await api.delete(`/admin/clients/${cid}/pg/${id}`)
      setSuccess('Connection berhasil dihapus!')
      fetchConns()
    } catch {
      setError('Gagal menghapus koneksi')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>
        Client {client?.name || cid} — PG Connections
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
          min={0}
          step={0.1}
          value={fee}
          onChange={e => setFee(parseFloat(e.target.value) || 0)}
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
          {loading ? 'Processing…' : 'Save Connection'}
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
            {conns.length === 0
              ? (
                <tr>
                  <td colSpan={5} className={styles.empty}>No connections</td>
                </tr>
              ) : (
                conns.map(c => (
                  <tr key={c.id}>
                    <td>{c.pgProvider?.name || c.pgProviderId}</td>
                    <td>{c.pgProvider?.credentials.partnerId || '—'}</td>
                    <td>{c.clientFee}</td>
                    <td>{c.activeDays.map(d => d.slice(0,3)).join(', ')}</td>
                    <td className={styles.actions}>
                      <button className={styles.editBtn} onClick={() => {
                        setFee(c.clientFee)
                        setDays(c.activeDays)
                        updateConn(c.id)
                      }}>Update</button>
                      <button className={styles.delBtn} onClick={() => deleteConn(c.id)}>Delete</button>
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
