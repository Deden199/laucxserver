'use client'

import { useEffect, useState } from 'react'
import { useRouter }         from 'next/navigation'
import api                   from '@/lib/apiClient'
import styles                from './ClientDashboard.module.css'
import { ClipboardCopy }     from 'lucide-react'

type Tx = {
  id:        string
  date:      string
  reference: string
  amount:    number
  feeLauncx: number
  netSettle: number
  status:    string
}

export default function ClientDashboardPage() {
  const [balance,    setBalance]    = useState(0)
  const [totalTrans, setTotalTrans] = useState(0)
  const [totalPend,  setTotalPend]  = useState(0)
  const [txs,        setTxs]        = useState<Tx[]>([])
  const [loading,    setLoading]    = useState(true)
  const [range,      setRange]      = useState<'today'|'week'|'custom'>('today')
  const [from,       setFrom]       = useState(() => new Date().toISOString().slice(0,10))
  const [to,         setTo]         = useState(() => new Date().toISOString().slice(0,10))
  const [search,     setSearch]     = useState('')
  const router = useRouter()

  function copyText(txt: string) {
    navigator.clipboard.writeText(txt)
      .then(() => alert('Disalin!'))
      .catch(() => alert('Gagal menyalin'))
  }

  function buildParams() {
    const params: any = {}
    if (range === 'today') {
      params.date_from = new Date().toISOString().slice(0,10)
    } else if (range === 'week') {
      const d = new Date(); d.setDate(d.getDate()-6)
      params.date_from = d.toISOString().slice(0,10)
    } else {
      params.date_from = from
      params.date_to   = to
    }
    return params
  }

  async function fetchData() {
    setLoading(true)
    const token = localStorage.getItem('clientToken')
    if (!token) return router.push('/client/login')

    try {
      const { data } = await api.get<{
        balance:         number
        totalTransaksi:  number
        totalPending:    number
        transactions:    Tx[]
      }>('/client/dashboard', { params: buildParams() })

      setBalance(data.balance)
      setTotalPend(data.totalPending)
      setTxs(data.transactions)
      setTotalTrans(data.transactions.length)
    } catch {
      router.push('/client/login')
    } finally {
      setLoading(false)
    }
  }

  async function handleExport() {
    const token = localStorage.getItem('clientToken')
    if (!token) return router.push('/client/login')

    const params = buildParams()
    try {
      const resp = await api.get('/client/dashboard/export', {
        params,
        responseType: 'blob'
      })
      const blob = new Blob([resp.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'client-transactions.xlsx'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      alert('Gagal export data')
    }
  }

  useEffect(() => { fetchData() }, [range])

  const filtered = txs.filter(t =>
    t.id.toLowerCase().includes(search.toLowerCase()) ||
    t.reference.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) {
    return <div className={styles.loader}>Loading…</div>
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>Client Dashboard</h1>
        <button
          className={styles.logoutBtn}
          onClick={() => {
            localStorage.removeItem('clientToken')
            router.push('/client/login')
          }}
        >Logout</button>
      </header>

      <section className={styles.filters}>
        <div className={styles.rangeControls}>
          <select value={range} onChange={e => setRange(e.target.value as any)}>
            <option value="today">Hari ini</option>
            <option value="week">7 Hari Terakhir</option>
            <option value="custom">Custom</option>
          </select>
          {range === 'custom' && (
            <>
              <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} />
              <input type="date" value={to}   min={from} onChange={e => setTo(e.target.value)}   />
              <button onClick={fetchData}>Terapkan</button>
            </>
          )}
          <button className={styles.exportBtn} onClick={handleExport}>
            Export Excel
          </button>
        </div>
        <input
          type="text"
          placeholder="Cari by TRX ID atau Referensi…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className={styles.searchInput}
        />
      </section>

      <section className={styles.statsGrid}>
        <div className={styles.card}>
          <h2>Saldo Aktif</h2>
          <p>{balance.toLocaleString('id-ID',{ style:'currency', currency:'IDR' })}</p>
        </div>
        <div className={styles.card}>
          <h2>Jumlah Transaksi</h2>
          <p>{totalTrans}</p>
        </div>
        <div className={styles.card}>
          <h2>Pending Settlement</h2>
          <p>{totalPend.toLocaleString('id-ID',{ style:'currency', currency:'IDR' })}</p>
        </div>
      </section>

      <section className={styles.tableSection}>
        <h2>Daftar Transaksi &amp; Settlement</h2>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>TRX ID</th>
                <th>RRN</th>
                <th>Jumlah</th>
                <th>Fee</th>
                <th>Net Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => (
                <tr key={t.id}>
                  <td>
                    {new Date(t.date).toLocaleString('id-ID',{ dateStyle:'short', timeStyle:'short' })}
                  </td>
                  <td>
                    <code className="font-mono">{t.id}</code>
                    <button
                      className={styles.copyBtn}
                      onClick={() => copyText(t.id)}
                      title="Copy TRX ID"
                    ><ClipboardCopy size={14}/></button>
                  </td>
                  <td className={styles.ellipsis}>
                    {t.reference}
                    <button
                      className={styles.copyBtn}
                      onClick={() => copyText(t.reference)}
                      title="Copy Referensi"
                    ><ClipboardCopy size={14}/></button>
                  </td>
                  <td>{t.amount.toLocaleString('id-ID',{ style:'currency', currency:'IDR' })}</td>
                  <td>{t.feeLauncx.toLocaleString('id-ID',{ style:'currency', currency:'IDR' })}</td>
                  <td className={styles.netSettle}>
                    {t.netSettle.toLocaleString('id-ID',{ style:'currency', currency:'IDR' })}
                  </td>
                  <td>{t.status.replace(/_/g, ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
