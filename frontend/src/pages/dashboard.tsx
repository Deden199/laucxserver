/* src/pages/Dashboard.tsx */
'use client'

import { useEffect, useState } from 'react'
import api                 from '@/lib/api'
import { useRequireAuth }  from '@/hooks/useAuth'
import styles              from './Dashboard.module.css'

/* ---------- Type helpers ---------- */
type RawTx = {
  id: string
  createdAt: string
  buyerId: string
  reference?: string
  amount?: number
  status: string
  pendingAmount?: number
  settlementAmount?: number
  /* variasi nama lain */
  net_amount?: number
  fee?: number
  feeLauncx?: number
}
type Tx = {
  id: string
  createdAt: string
  buyerId: string
  reference: string
  amount: number
  status: string
  pendingAmount: number
  settlementAmount: number
  feeLauncx: number
}

/* ---------- Date helpers ---------- */
const today0     = () => { const d=new Date(); d.setHours(0,0,0,0); return d }
const sevenDays0 = () => { const d=new Date(); d.setDate(d.getDate()-6); d.setHours(0,0,0,0); return d }
const iso        = (d:Date) => d.toISOString().slice(0,10)

/* ---------- Component ---------- */
export default function DashboardPage() {
  useRequireAuth()

  const [txs, setTxs]         = useState<Tx[]>([])
  const [loading, setLoading] = useState(true)

  const [range, setRange] = useState<'today'|'week'|'custom'>('today')
  const [from,  setFrom]  = useState(iso(today0()))
  const [to,    setTo]    = useState(iso(new Date()))

  /* ---- fetch ---- */
  const fetchTx = async () => {
    setLoading(true)
    const p: any = {}
    if (range==='today') p.date_from = iso(today0())
    if (range==='week')  p.date_from = iso(sevenDays0())
    if (range==='custom'){ p.date_from=from; p.date_to=to }
    const res = await api.get<RawTx[]>('/merchant/dashboard/transactions',{ params:p })
    const norm: Tx[] = res.data.map(r=>({
      id:   r.id,
      createdAt: r.createdAt,
      buyerId:   r.buyerId,
      reference: (r.reference||r.id).slice(0,26) + ((r.reference||r.id).length>26?'…':''),
      amount:    r.amount ?? r.net_amount ?? 0,
      status:    r.status,
      pendingAmount:    r.pendingAmount    ?? 0,
      settlementAmount: r.settlementAmount ?? 0,
      feeLauncx:        r.feeLauncx        ?? r.fee ?? 0,
    }))
    setTxs(norm); setLoading(false)
  }
  useEffect(()=>{ fetchTx() },[range])             /* refetch saat range berubah */

  /* ---- summary ---- */
  const SUC  = ['SUCCESS','DONE','SETTLED']
  const PEND = ['WAIT_FOR_SETTLEMENT','PENDING_SETTLEMENT','READY_TO_DISBURSEMENT']

  const success = txs.filter(t=>SUC.includes(t.status))
  const pending = txs.filter(t=>PEND.includes(t.status))

  const totalTrans = success.reduce((s,t)=>s+t.amount,0)
  const totalPend  = pending.reduce((s,t)=>s+t.pendingAmount,0)
  const totalSet   = success.reduce((s,t)=>s+t.settlementAmount,0)

  const visibleTxs = txs.filter(t=>!['FAILED','PENDING'].includes(t.status))

  /* ---- download ---- */
  const exportExcel = async () =>{
    const p:any={}
    if(range!=='custom') p.date_from=range==='today'?iso(today0()):iso(sevenDays0())
    if(range==='custom'){ p.date_from=from; p.date_to=to }
    const resp = await api.get('/merchant/dashboard/export',{params:p, responseType:'blob'})
    const url  = URL.createObjectURL(new Blob([resp.data]))
    const a=document.createElement('a'); a.href=url; a.download='transactions.xlsx'; a.click()
    URL.revokeObjectURL(url)
  }

  /* ---- UI ---- */
  if(loading) return <div className={styles.loader}>Loading merchant dashboard…</div>

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <h1>Merchant Dashboard</h1>
        <button className={styles.logoutBtn} onClick={()=>{
          localStorage.removeItem('token'); location.href='/login'
        }}>Logout</button>
      </header>

      {/* Filters */}
      <section className={styles.filters}>
        <select value={range} onChange={e=>setRange(e.target.value as any)}>
          <option value="today">Hari ini</option>
          <option value="week">7 hari terakhir</option>
          <option value="custom">Custom</option>
        </select>
        {range==='custom' && (
          <>
            <input type="date" value={from} max={to} onChange={e=>setFrom(e.target.value)}/>
            <input type="date" value={to}   min={from} onChange={e=>setTo(e.target.value)}/>
            <button onClick={fetchTx}>Terapkan</button>
          </>
        )}
        <button className={styles.exportBtn} onClick={exportExcel}>Export Excel</button>
      </section>

      {/* Stats */}
      <section className={styles.statsGrid}>
        <div className={styles.card}><h2>Total Transaksi</h2><p>
          {totalTrans.toLocaleString('id-ID',{style:'currency',currency:'IDR'})}</p></div>
        <div className={styles.card}><h2>Pending Settlement</h2><p>
          {totalPend.toLocaleString('id-ID',{style:'currency',currency:'IDR'})}</p></div>
        <div className={styles.card}><h2>Total Settled</h2><p>
          {totalSet.toLocaleString('id-ID',{style:'currency',currency:'IDR'})}</p></div>
      </section>

      {/* Table */}
      <section className={styles.tableSection}>
        <h2>Daftar Transaksi &amp; Settlement</h2>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Tanggal</th><th>Nama</th><th>Referensi</th>
                <th>Jumlah</th><th>Fee Launcx</th><th>Net Settle</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {visibleTxs.map(t=>{
                const base = t.settlementAmount || t.pendingAmount || t.amount
                const net  = base - t.feeLauncx
                return (
                  <tr key={t.id}>
                    <td>{new Date(t.createdAt).toLocaleString('id-ID',{dateStyle:'short',timeStyle:'short'})}</td>
                    <td>{t.buyerId}</td>
                    <td className={styles.ellipsis}>{t.reference}</td>
                    <td>{t.amount.toLocaleString('id-ID',{style:'currency',currency:'IDR'})}</td>
                    <td>{t.feeLauncx.toLocaleString('id-ID',{style:'currency',currency:'IDR'})}</td>
                    <td>{net.toLocaleString('id-ID',{style:'currency',currency:'IDR'})}</td>
                    <td>{t.status.replace(/_/g,' ')}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
