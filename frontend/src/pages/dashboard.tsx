'use client'

import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { useRequireAuth } from '@/hooks/useAuth'
import { Wallet, ListChecks, Clock, FileText, ClipboardCopy, Layers } from 'lucide-react'
import styles from './Dashboard.module.css'

type RawTx = {
  id: string
  date: string
  playerId: string
  rrn?: string
  reference?: string
  amount?: number
  feeLauncx?: number
  feePg?: number
  pendingAmount?: number
  settlementAmount?: number
  status?: string
  settlementStatus?: string
}

type Tx = {
  id: string
  date: string
  rrn: string
  playerId: string
  amount: number
  feeLauncx: number
  feePg: number
  netSettle: number
  status: '' | 'SUCCESS' | 'DONE'
  settlementStatus: string
}

type Merchant = { id: string; name: string }

type TransactionsResponse = {
  transactions: RawTx[]
  totalPending: number
  totalMerchantBalance: number
}

export default function DashboardPage() {
  useRequireAuth()

  // Merchant dropdown
  const [merchants, setMerchants] = useState<Merchant[]>([])
  const [selectedMerchant, setSelectedMerchant] = useState<'all' | string>('all')

  // Filters
  const [range, setRange] = useState<'today'|'week'|'custom'>('today')
  const [from, setFrom]   = useState(() => new Date().toISOString().slice(0,10))
  const [to, setTo]       = useState(() => new Date().toISOString().slice(0,10))
  const [search, setSearch] = useState('')

  // Summary cards state
  const [loadingSummary, setLoadingSummary] = useState(true)
  const [balanceHilogate, setBalanceHilogate] = useState(0)
  const [activeBalance, setActiveBalance]     = useState(0)
  const [totalPending, setTotalPending]       = useState(0)
  const [loadingProfit, setLoadingProfit]     = useState(true)
  const [totalProfit, setTotalProfit]         = useState(0)

  // Transactions table state
  const [loadingTx, setLoadingTx] = useState(true)
  const [txs, setTxs]             = useState<Tx[]>([])
  const [totalTrans, setTotalTrans] = useState(0)

  // Date helpers
  const isoDate = (d: Date) => d.toISOString().slice(0,10)
  const today0  = () => { const d = new Date(); d.setHours(0,0,0,0); return d }
  const week0   = () => { const d = new Date(); d.setDate(d.getDate()-6); d.setHours(0,0,0,0); return d }

  const buildParams = () => {
    const p: any = {}
    if (range === 'today') p.date_from = isoDate(today0())
    else if (range === 'week') p.date_from = isoDate(week0())
    else {
      p.date_from = from
      p.date_to   = to
    }
    if (selectedMerchant !== 'all') p.merchantId = selectedMerchant
    return p
  }

  // Fetch Hilogate summary
  const fetchSummary = async () => {
    setLoadingSummary(true)
    try {
      const params = buildParams()
      if (!merchants.length) {
        const resp = await api.get<Merchant[]>('/admin/merchants')
        setMerchants(resp.data)
      }
      const { data } = await api.get<{
        hilogateBalance: number
        activeBalance?: number
        total_withdrawal?: number
        pending_withdrawal?: number
      }>('/admin/merchants/dashboard/summary', { params })
      setBalanceHilogate(data.hilogateBalance)
      if (data.activeBalance !== undefined) setActiveBalance(data.activeBalance)
      if (data.pending_withdrawal !== undefined) setTotalPending(data.pending_withdrawal)
    } catch (e) {
      console.error('fetchSummary error', e)
    } finally {
      setLoadingSummary(false)
    }
  }

  // Fetch platform profit
  const fetchProfit = async () => {
    setLoadingProfit(true)
    try {
      const params = buildParams()
      const { data } = await api.get<{ totalProfit: number }>(
        '/admin/merchants/dashboard/profit',
        { params }
      )
      setTotalProfit(data.totalProfit)
    } catch (e) {
      console.error('fetchProfit error', e)
    } finally {
      setLoadingProfit(false)
    }
  }

  // Fetch transactions list
  const fetchTransactions = async () => {
    setLoadingTx(true)
    try {
      const params = buildParams()
      const { data } = await api.get<TransactionsResponse>(
        '/admin/merchants/dashboard/transactions',
        { params }
      )
      setTotalPending(data.totalPending)
      setActiveBalance(data.totalMerchantBalance)

      const mapped: Tx[] = data.transactions.map(o => {
        const amt = o.amount ?? 0
        const feeL = o.feeLauncx ?? 0
        const feeP = o.feePg ?? 0
        const pendAmt = o.pendingAmount ?? 0
        const settleAmt = o.settlementAmount ?? amt
        const base = o.status === 'PENDING_SETTLEMENT' ? pendAmt : settleAmt
        const netSettle = base - feeL - feeP
        return {
          id: o.id,
          date: o.date,
          rrn: o.rrn ?? '-',
          playerId: o.playerId,
          amount: amt,
          feeLauncx: feeL,
          feePg: feeP,
          netSettle,
          status: o.status === 'DONE' ? 'DONE' : 'SUCCESS',
          settlementStatus: (o.settlementStatus ?? o.status ?? '').replace(/_/g, ' ')
        }
      })
      const filtered = mapped.filter(t =>
        t.id.toLowerCase().includes(search.toLowerCase()) ||
        t.rrn.toLowerCase().includes(search.toLowerCase()) ||
        t.playerId.toLowerCase().includes(search.toLowerCase())
      )
      setTxs(filtered)
      setTotalTrans(filtered.length)
    } catch (e) {
      console.error('fetchTransactions error', e)
    } finally {
      setLoadingTx(false)
    }
  }

  // Effects
  useEffect(() => {
    fetchSummary()
    fetchProfit()
  }, [range, from, to, selectedMerchant])
  useEffect(() => {
    fetchTransactions()
  }, [range, from, to, selectedMerchant, search])

  if (loadingSummary) {
    return <div className={styles.loader}>Loading summary…</div>
  }

  return (
    <div className={styles.container}>
      {/* Merchant selector */}
      <div className={styles.childSelector}>
        <label>Merchant:</label>
        <select
          value={selectedMerchant}
          onChange={e => setSelectedMerchant(e.target.value)}
        >
          <option value="all">Semua Merchant</option>
          {merchants.map(m => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>

      {/* Summary cards */}
      <aside className={styles.sidebar}>
        <section className={styles.statsGrid}>
          <div className={styles.card}>
            <Wallet className={styles.cardIcon} />
            <h2>Balance Hilogate</h2>
            <p>{balanceHilogate.toLocaleString('id-ID', { style: 'currency', currency: 'IDR' })}</p>
          </div>
          <div className={styles.card}>
            <Layers className={styles.cardIcon} />
            <h2>Total Client Balance</h2>
            <p>{activeBalance.toLocaleString('id-ID', { style: 'currency', currency: 'IDR' })}</p>
          </div>
          <div className={`${styles.card} ${styles.pendingBalance}`}>
            <Clock className={styles.cardIcon} />
            <h2>Pending Settlement</h2>
            <p>{totalPending.toLocaleString('id-ID', { style: 'currency', currency: 'IDR' })}</p>
          </div>
          <div className={styles.card}>
            <ListChecks className={styles.cardIcon} />
            <h2>Jumlah Transaksi</h2>
            <p>{totalTrans}</p>
          </div>
          <div className={styles.card}>
            <Layers className={styles.cardIcon} />
            <h2>Gross Profit</h2>
            <p>
              {loadingProfit
                ? 'Loading…'
                : (totalProfit ?? 0).toLocaleString('id-ID', { style: 'currency', currency: 'IDR' })}
            </p>
          </div>
        </section>
      </aside>

      {/* Filters & Table */}
      <main className={styles.content}>
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
                <input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} />
              </>
            )}
          </div>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Cari TRX ID, RRN, atau Player ID…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button
            className={styles.exportBtn}
            onClick={() => api.get('/admin/merchants/dashboard/export', {
              params: buildParams(), responseType: 'blob'
            }).then(r => {
              const url = URL.createObjectURL(new Blob([r.data]))
              const a = document.createElement('a')
              a.href = url
              a.download = 'admin-dashboard.xlsx'
              a.click()
              URL.revokeObjectURL(url)
            })}
          >
            <FileText size={16} /> Export Excel
          </button>
        </section>

        <section className={styles.tableSection}>
          <h2>Daftar Transaksi &amp; Settlement</h2>
          {loadingTx ? (
            <div className={styles.loader}>Loading transaksi…</div>
          ) : (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>TRX ID</th>
                    <th>RRN</th>
                    <th>Player ID</th>
                    <th>Amount</th>
                    <th>Fee Launcx</th>
                    <th>Fee PG</th>
                    <th>Net Amount</th>
                    <th>Status</th>
                    <th>Settlement Status</th>
                  </tr>
                </thead>
                <tbody>
                  {txs.map(t => (
                    <tr key={t.id}>
                      <td>{new Date(t.date).toLocaleString('id-ID', { dateStyle:'short', timeStyle:'short' })}</td>
                      <td>
                        <code className="font-mono">{t.id}</code>
                        <button className={styles.copyBtn} onClick={() => navigator.clipboard.writeText(t.id)}>
                          <ClipboardCopy size={14} />
                        </button>
                      </td>
                      <td>
                        <div className={styles.rrnCell}>
                          <span className={styles.ellipsis}>{t.rrn}</span>
                          <button className={styles.copyBtn} onClick={() => navigator.clipboard.writeText(t.rrn)}>
                            <ClipboardCopy size={14} />
                          </button>
                        </div>
                      </td>
                      <td>{t.playerId}</td>
                      <td>{t.amount.toLocaleString('id-ID', { style:'currency', currency:'IDR' })}</td>
                      <td>{t.feeLauncx.toLocaleString('id-ID', { style:'currency', currency:'IDR' })}</td>
                      <td>{t.feePg.toLocaleString('id-ID', { style:'currency', currency:'IDR' })}</td>
                      <td className={styles.netSettle}>{t.netSettle.toLocaleString('id-ID', { style:'currency', currency:'IDR' })}</td>
                      <td>{t.status}</td>
                      <td>{t.settlementStatus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
