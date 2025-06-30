/* src/pages/Dashboard.tsx */
'use client'

import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { useRequireAuth } from '@/hooks/useAuth'
import {
  Wallet,
  ListChecks,
  Clock,
  FileText,
  CreditCard,
  Layers,
  TrendingUp,
  ClipboardCopy,
} from 'lucide-react'
import styles from './Dashboard.module.css'

type RawTx = {
  id: string
  createdAt: string
  userId: string
  rrn?: string
  qrPayload?: string
  amount?: number
  pendingAmount?: number
  settlementAmount?: number
  feeLauncx?: number
  fee3rdParty?: number
  status: string
  settlementStatus?: string
}

type Tx = {
  id: string
  date: string
  trxId: string
  rrn: string
  buyerId: string
  reference: string
  amount: number
  feeLauncx: number
  feePg: number
  netSettle: number
  settlementStatus: string
  status: ''|'SUCCESS'|'DONE'
}

type Merchant = { id: string; name: string }

export default function DashboardPage() {
  useRequireAuth()

  const [merchants, setMerchants] = useState<Merchant[]>([])
  const [selectedMerchant, setSelectedMerchant] = useState<'all' | string>('all')
  const [search, setSearch] = useState('')

  const [txs, setTxs] = useState<Tx[]>([])
  const [loading, setLoading] = useState(true)

  const [range, setRange] = useState<'today'|'week'|'custom'>('today')
  const [from, setFrom] = useState(() => new Date().toISOString().slice(0,10))
  const [to, setTo]     = useState(() => new Date().toISOString().slice(0,10))

  // summary cards
  const [balanceHilogate, setBalanceHilogate] = useState(0)
  const [activeBalance, setActiveBalance]     = useState(0)
  const [totalPend, setTotalPend]             = useState(0)
  const [totalTrans, setTotalTrans]           = useState(0)
  const [totalSettle, setTotalSettle]         = useState(0)
  const [totalFeePg, setTotalFeePg]           = useState(0)
  const [totalNetProfit, setTotalNetProfit]   = useState(0)

  const isoDate = (d: Date) => d.toISOString().slice(0,10)
  const today0  = () => { const d=new Date(); d.setHours(0,0,0,0); return d }
  const week0   = () => { const d=new Date(); d.setDate(d.getDate()-6); d.setHours(0,0,0,0); return d }

  const buildParams = () => {
    const p: any = {}
    if (range==='today')      p.date_from = isoDate(today0())
    else if (range==='week')   p.date_from = isoDate(week0())
    else {
      p.date_from = from
      p.date_to   = to
    }
    if (selectedMerchant!=='all') p.merchantId = selectedMerchant
    return p
  }

  const fetchData = async () => {
    setLoading(true)
    const params = buildParams()

    // fetch merchants for dropdown
    if (merchants.length===0) {
      const m = await api.get<Merchant[]>('/admin/merchants')
      setMerchants(m.data)
    }

    // summary balances + pending
    const sumRes = await api.get<{
      hilogateBalance:number,
      activeBalance:number,
      totalPending:number
    }>('/admin/merchants/dashboard/summary', { params })
    setBalanceHilogate(sumRes.data.hilogateBalance)
    setActiveBalance(sumRes.data.activeBalance)
    setTotalPend(sumRes.data.totalPending)

    // transactions
    const res = await api.get<RawTx[]>('/admin/merchants/dashboard/transactions', { params })
    const mapped: Tx[] = res.data
      .filter(r => ['SUCCESS','DONE','SETTLED','PENDING_SETTLEMENT'].includes(r.status))
      .map(r => {
        const amt     = r.amount ?? 0
        const feeL    = r.feeLauncx ?? 0
        const feeP    = r.fee3rdParty ?? 0
        const pend    = r.pendingAmount ?? 0
        const settle  = r.settlementAmount ?? 0
        const netSettle = r.status==='PENDING_SETTLEMENT'
          ? pend - feeL
          : settle - feeL
        return {
          id:               r.id,
          date:             r.createdAt,
          trxId:            r.id,
          rrn:              r.rrn ?? r.qrPayload ?? '',
          buyerId:          r.userId,
          reference:        r.qrPayload ?? '',
          amount:           amt,
          feeLauncx:        feeL,
          feePg:            feeP,
          netSettle,
          status:           r.status==='DONE' ? 'DONE' : (r.status==='PENDING_SETTLEMENT'?'': 'SUCCESS'),
          settlementStatus: r.settlementStatus ?? '',
        }
      })

    // client‐side search + filter success only in cards
    const filtered = mapped.filter(t =>
      t.trxId.toLowerCase().includes(search.toLowerCase()) ||
      t.rrn.toLowerCase().includes(search.toLowerCase()) ||
      t.buyerId.toLowerCase().includes(search.toLowerCase())
    )
    setTxs(filtered)

    // compute summary for success
    const successTx = mapped.filter(t=>['SUCCESS','DONE','SETTLED'].includes(t.status))
    setTotalTrans(successTx.length)
    setTotalSettle(successTx.reduce((a,t)=>a+t.netSettle,0))
    setTotalFeePg(successTx.reduce((a,t)=>a+t.feePg,0))
    setTotalNetProfit(successTx.reduce((a,t)=>a+(t.feeLauncx - t.feePg),0))

    setLoading(false)
  }

  useEffect(() => { fetchData() }, [range, from, to, selectedMerchant, search])

  if (loading) return <div className={styles.loader}>Loading…</div>

  return (
    <div className={styles.container}>

      {/* Merchant dropdown */}
      <div className={styles.childSelector}>
        <label>Merchant:&nbsp;</label>
        <select value={selectedMerchant} onChange={e=>setSelectedMerchant(e.target.value)}>
          <option value="all">Semua Merchant</option>
          {merchants.map(m=>(
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>

      {/* Summary cards */}
      <aside className={styles.sidebar}>
        <section className={styles.statsGrid}>
          <div className={styles.card}><Wallet className={styles.cardIcon}/><h2>Balance Hilogate</h2><p>{balanceHilogate.toLocaleString('id-ID',{style:'currency',currency:'IDR'})}</p></div>
          <div className={styles.card}><Layers className={styles.cardIcon}/><h2>Active Balance</h2><p>{activeBalance.toLocaleString('id-ID',{style:'currency',currency:'IDR'})}</p></div>
          <div className={`${styles.card} ${styles.pendingBalance}`}><Clock className={styles.cardIcon}/><h2>Pending Settlement</h2><p>{totalPend.toLocaleString('id-ID',{style:'currency',currency:'IDR'})}</p></div>
          <div className={styles.card}><ListChecks className={styles.cardIcon}/><h2>Jumlah Transaksi</h2><p>{totalTrans}</p></div>
          <div className={styles.card}><FileText className={styles.cardIcon}/><h2>Total Settled</h2><p>{totalSettle.toLocaleString('id-ID',{style:'currency',currency:'IDR'})}</p></div>
          <div className={styles.card}><CreditCard className={styles.cardIcon}/><h2>Total Fee PG</h2><p>{totalFeePg.toLocaleString('id-ID',{style:'currency',currency:'IDR'})}</p></div>
          <div className={styles.card}><TrendingUp className={styles.cardIcon}/><h2>Net Profit</h2><p>{totalNetProfit.toLocaleString('id-ID',{style:'currency',currency:'IDR'})}</p></div>
        </section>
      </aside>

      {/* Filters & Search */}
      <main className={styles.content}>
        <section className={styles.filters}>
          <div className={styles.rangeControls}>
            <select value={range} onChange={e=>setRange(e.target.value as any)}>
              <option value="today">Hari ini</option>
              <option value="week">7 Hari Terakhir</option>
              <option value="custom">Custom</option>
            </select>
            {range==='custom'&&(
              <>
                <input type="date" value={from} max={to} onChange={e=>setFrom(e.target.value)}/>
                <input type="date" value={to}   min={from} onChange={e=>setTo(e.target.value)}/>
              </>
            )}
          </div>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Cari TRX ID, RRN, atau Buyer ID…"
            value={search}
            onChange={e=>setSearch(e.target.value)}
          />
          <button className={styles.exportBtn} onClick={()=>api.get('/admin/merchants/dashboard/export',{ params: buildParams(), responseType:'blob' }).then(r=>{
            const url=URL.createObjectURL(new Blob([r.data])); const a=document.createElement('a'); a.href=url; a.download='admin.xlsx'; a.click(); URL.revokeObjectURL(url)
          })}>
            <FileText size={16}/> Export Excel
          </button>
        </section>

        {/* Table */}
        <section className={styles.tableSection}>
          <h2>Daftar Transaksi &amp; Settlement</h2>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Date</th><th>TRX ID</th><th>RRN</th><th>Buyer ID</th>
                  <th>Reference</th><th>Amount</th><th>Fee Launcx</th><th>Fee PG</th>
                  <th>Net Settle</th><th>Status</th><th>Settlement Status</th>
                </tr>
              </thead>
              <tbody>
                {txs.map(t=>(
                  <tr key={t.id}>
                    <td>{new Date(t.date).toLocaleString('id-ID',{dateStyle:'short',timeStyle:'short'})}</td>
                    <td>
                      <code className="font-mono">{t.trxId}</code>
                      <button className={styles.copyBtn} onClick={()=>navigator.clipboard.writeText(t.trxId)}><ClipboardCopy size={14}/></button>
                    </td>
                    <td>
                      <div className={styles.rrnCell}>
                        <span className={styles.ellipsis}>{t.rrn}</span>
                        <button className={styles.copyBtn} onClick={()=>navigator.clipboard.writeText(t.rrn!)}><ClipboardCopy size={14}/></button>
                      </div>
                    </td>
                    <td>{t.buyerId}</td>
                    <td className={styles.ellipsis}>{t.reference}</td>
                    <td>{t.amount.toLocaleString('id-ID',{style:'currency',currency:'IDR'})}</td>
                    <td>{t.feeLauncx.toLocaleString('id-ID',{style:'currency',currency:'IDR'})}</td>
                    <td>{t.feePg.toLocaleString('id-ID',{style:'currency',currency:'IDR'})}</td>
                    <td className={styles.netSettle}>{t.netSettle.toLocaleString('id-ID',{style:'currency',currency:'IDR'})}</td>
                    <td>{t.status}</td>
                    <td>{t.settlementStatus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  )
}
