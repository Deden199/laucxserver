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
  settlementStatus: string
  netSettle:        number   // <— baru
  channel?:     string   // ← baru
  paymentReceivedTime?: string
  settlementTime?: string
  trxExpirationTime?: string


}
interface Withdrawal {
  id: string
  refId: string
  accountName: string
  accountNameAlias: string
  accountNumber: string
  bankCode: string
  bankName: string
  branchName?: string
  amount: number
  withdrawFeePercent: number
  withdrawFeeFlat: number
  pgFee?: number

  netAmount?: number
  paymentGatewayId?: string
  isTransferProcess: boolean
  status: string
  createdAt: string
  completedAt?: string
  wallet: string

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
  status: '' | 'SUCCESS' | 'PENDING' | 'EXPIRED' | 'DONE' | 'PAID'
  settlementStatus: string
  channel:          string  // ← baru
    paymentReceivedTime?: string
  settlementTime?: string
  trxExpirationTime?: string

}

type Merchant = { id: string; name: string }
type SubBalance = { id: string; name: string; provider: string; balance: number }

type TransactionsResponse = {
  transactions: RawTx[]
  total: number
  totalPending: number
  ordersActiveBalance: number
  totalMerchantBalance: number
   totalPaid: number             // ← tambahan

}

export default function DashboardPage() {
  useRequireAuth()

    // ─────────── State withdrawal history ───────────
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])
  const [loadingWd, setLoadingWd] = useState(true)
  // Merchant dropdown
  const [merchants, setMerchants] = useState<Merchant[]>([])
  const [selectedMerchant, setSelectedMerchant] = useState<'all' | string>('all')
const [subBalances, setSubBalances] = useState<SubBalance[]>([])
const [selectedSub, setSelectedSub] = useState<string>('')
const [currentBalance, setCurrentBalance] = useState(0)
  // Filters
  
  const [range, setRange] = useState<'today'|'week'|'custom'>('today')
  const [from, setFrom]   = useState(() => toJakartaDate(new Date()))
  const [to, setTo]       = useState(() => toJakartaDate(new Date()))
  const [search, setSearch] = useState('')
const [statusFilter, setStatusFilter] = useState<'SUCCESS' | 'PAID' | string>('PAID')


  const [totalPages, setTotalPages] = useState(1)

  // Summary cards state
  const [loadingSummary, setLoadingSummary] = useState(true)
 const [totalClientBalance, setTotalClientBalance] = useState(0)

  const [activeBalance, setActiveBalance]     = useState(0)
  const [totalPending, setTotalPending]       = useState(0)
  const [loadingProfit, setLoadingProfit]     = useState(true)
  const [totalProfit, setTotalProfit]         = useState(0)
  const [loadingProfitSub, setLoadingProfitSub] = useState(true)
  const [profitSubs, setProfitSubs] = useState<{
    subMerchantId: string
    name?: string | null
    profit: number
  }[]>([])
  // Transactions table state
  const [loadingTx, setLoadingTx] = useState(true)
  const [txs, setTxs]             = useState<Tx[]>([])
  const [totalTrans, setTotalTrans] = useState(0)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)
  // Date helpers
  function toJakartaDate(d: Date): string {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta' }).format(d)
  }  const today0  = () => { const d = new Date(); d.setHours(0,0,0,0); return d }
  const week0   = () => { const d = new Date(); d.setDate(d.getDate()-6); d.setHours(0,0,0,0); return d }

function buildParams() {
  const p: any = {}
  const tz = 'Asia/Jakarta'

  if (range === 'today') {
    // jam 00:00:00 di Jakarta
    const startStr = new Date().toLocaleString('en-US', {
      timeZone: tz,
      hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    })
    // parse ulang ke Date lalu set ke 00:00:00
    const [m, d, y, H, M, S] = startStr.match(/\d+/g)!.map(Number)
    const start = new Date(y, m-1, d, 0, 0, 0)
    // sekarang waktu Jakarta
    const nowStr = new Date().toLocaleString('en-US', { timeZone: tz, hour12: false })
    const now = new Date(nowStr)

    p.date_from = start.toISOString()
    p.date_to   = now.toISOString()
  }
  else if (range === 'week') {
    // 7 hari lalu 00:00 Jakarta
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 6)
    const weekStr = weekAgo.toLocaleString('en-US', {
      timeZone: tz,
      hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit'
    })
    const [m, d, y] = weekStr.match(/\d+/g)!.slice(0,3).map(Number)
    const start = new Date(y, m-1, d, 0, 0, 0)
    // sampai sekarang Jakarta
    const nowStr = new Date().toLocaleString('en-US', { timeZone: tz, hour12: false })
    const now = new Date(nowStr)

    p.date_from = start.toISOString()
    p.date_to   = now.toISOString()
  }
  else {
    // custom — gunakan full‑day juga
    const [fy, fm, fd] = from.split('-').map(Number)
    const [ty, tm, td] = to.split('-').map(Number)
    p.date_from = new Date(fy, fm-1, fd, 0, 0, 0).toISOString()
    p.date_to   = new Date(ty, tm-1, td, 23, 59, 59).toISOString()
  }

  if (selectedMerchant !== 'all') {
    p.partnerClientId = selectedMerchant
  }
    if (statusFilter !== 'all') {
    p.status = statusFilter
  }
    p.page  = page
  p.limit = perPage
  console.log('buildParams →', p)
  return p
}


  // Fetch Hilogate summary
const fetchSummary = async () => {
  setLoadingSummary(true)
  try {
    const params = buildParams()

    // (1) ambil list merchants sekali saja
    if (!merchants.length) {
      const resp = await api.get<Merchant[]>('/admin/merchants/allclient')
      setMerchants(resp.data)
    }

    // (2) panggil endpoint summary, termasuk oyBalance
    const { data } = await api.get<{
      subBalances:        SubBalance[]
      activeBalance?:     number
         totalClientBalance: number    // ← Ubah response type

      total_withdrawal?:  number
      pending_withdrawal?:number
    }>('/admin/merchants/dashboard/summary', { params })

    // (3) set state untuk semua balance
    setSubBalances(data.subBalances)
    const current = data.subBalances.find(s => s.id === selectedSub) || data.subBalances[0]
    if (current) {
      setSelectedSub(current.id)
      setCurrentBalance(current.balance)
    }
if (data.totalClientBalance !== undefined) setTotalClientBalance(data.totalClientBalance)  // ← Tambahkan ini
    if (data.pending_withdrawal  !== undefined) setTotalPending(data.pending_withdrawal)

  } catch (e) {
    console.error('fetchSummary error', e)
  } finally {
    setLoadingSummary(false)
  }
}

  const fetchProfitSub = async () => {
    setLoadingProfitSub(true)
    try {
      const params = buildParams()
      const { data } = await api.get<{ data: { subMerchantId: string; name?: string | null; profit: number }[] }>(
        '/admin/merchants/dashboard/profit-submerchant',
        { params }
      )
      setProfitSubs(data.data)
    } catch (e) {
      console.error('fetchProfitSub error', e)
    } finally {
      setLoadingProfitSub(false)
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
async function fetchWithdrawals() {
  setLoadingWd(true)
  try {
    const params = buildParams()
    const { data } = await api.get<{ data: Withdrawal[] }>(
      '/admin/merchants/dashboard/withdrawals',
      { params }
    )
    setWithdrawals(data.data)
  } catch (err: any) {
    console.error('fetchWithdrawals error', err)
    if (err.response?.status === 401) {
    }
  } finally {
    setLoadingWd(false)
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
    setActiveBalance(data.ordersActiveBalance)
    setTotalPages(Math.max(1, Math.ceil(data.total / perPage)))
    // pakai totalPaid dari API:
    setTotalTrans(data.totalPaid)
      // LANGSUNG PAKAI netSettle dari server
// Daftar status yang valid sesuai Tx['status']
const VALID_STATUSES: Tx['status'][] = [
  'SUCCESS',
  'PENDING',
  'EXPIRED',
  'DONE',
  'PAID',
];

const mapped: Tx[] = data.transactions.map(o => {
  const raw = o.status ?? '';

  // Jika status dari server cocok dengan salah satu VALID_STATUSES, pakai itu,
  // jika tidak, fallback ke '' (kosong)
  const statusTyped: Tx['status'] = VALID_STATUSES.includes(raw as Tx['status'])
    ? (raw as Tx['status'])
    : '';

  return {
    id:                 o.id,
    date:               o.date,
    rrn:                o.rrn ?? '-',
    playerId:           o.playerId,
    amount:             o.amount ?? 0,
    feeLauncx:          o.feeLauncx ?? 0,
    feePg:              o.feePg ?? 0,
    netSettle:          o.netSettle,
    status:             statusTyped,                                // <<< revisi
    settlementStatus:   o.settlementStatus.replace(/_/g, ' '),
    paymentReceivedTime: o.paymentReceivedTime ?? '',
    settlementTime:     o.settlementTime ?? '',
    trxExpirationTime:  o.trxExpirationTime ?? '',
    channel:            o.channel ?? '-',
  };
});

const filtered = mapped.filter(t => {
 
  // (2) Kalau search kosong, tampilkan semua yang lolos status
  const q = search.trim().toLowerCase();
    if (!q) return true;

  // (3) Baru cek keyword di id, rrn, atau playerId
  return (
    t.id.toLowerCase().includes(q) ||
    t.rrn.toLowerCase().includes(q) ||
    t.playerId.toLowerCase().includes(q)
  );
});


   setTxs(filtered)

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
    fetchProfitSub()

    fetchWithdrawals()
  }, [range, from, to, selectedMerchant])
  useEffect(() => {
    fetchTransactions()
  }, [range, from, to, selectedMerchant, search, statusFilter, page, perPage])

  if (loadingSummary) {
    return <div className={styles.loader}>Loading summary…</div>
  }

  return (
    <div className={styles.container}>
      {/* Merchant selector */}
      <div className={styles.childSelector}>
        <label>Client:</label>
        <select
          value={selectedMerchant}
          onChange={e => setSelectedMerchant(e.target.value)}
        >
          <option value="all">Semua Client</option>
          {merchants.map(m => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>
<aside className={styles.sidebar}>


  <section className={styles.statsGrid}>
    {/* Kartu pertama: Balance per Sub Merchant */}
   <div className={`${styles.card} ${styles.activeBalance}`}>
      
      <Wallet className={styles.cardIcon} />
      <h2>
        Balance {subBalances.find(s => s.id === selectedSub)?.name || ''}
      </h2>
      <p>
        {currentBalance.toLocaleString('id-ID', { style: 'currency', currency: 'IDR' })}

      </p>
        {/* dropdown untuk memilih sub-merchant */}
  <div className={styles.balanceSelector}>
    <label>Sub Merchant:  </label>
    <select
      value={selectedSub}
      onChange={e => {
        setSelectedSub(e.target.value)
        const sb = subBalances.find(s => s.id === e.target.value)
        setCurrentBalance(sb?.balance ?? 0)
      }}
    >
      {subBalances.map(s => (
        <option key={s.id} value={s.id}>{s.name}</option>
      ))}
    </select>
  </div>
    </div>

    {/* Kartu-kartu lain tetap sama */}
   <div className={`${styles.card} ${styles.activeBalance}`}>
      <Layers className={styles.cardIcon} />
      <h2>Total Client Balance</h2>
    <p>{totalClientBalance.toLocaleString('id-ID', { style: 'currency', currency: 'IDR' })}</p>
    </div>

    {/* <div className={`${styles.card} ${styles.pendingBalance}`}>
      … (Pending Settlement) …
    </div> */}

   <div className={`${styles.card} ${styles.pendingBalance}`}>
      <ListChecks className={styles.cardIcon} />
      <h2>Total Nominal Paid</h2>
      <p>{totalTrans.toLocaleString('id-ID', { style: 'currency', currency: 'IDR' })}</p>
    </div>
   <div className={`${styles.card} ${styles.pendingBalance}`}>
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

<section className={styles.cardSection} style={{ marginTop: 32 }}>
  <h2>Profit per sub</h2>
  {loadingProfitSub ? (
    <div className={styles.loader}>Loading profit…</div>
  ) : (
    <div className={styles.statsGrid}>
      {profitSubs.length > 0 ? (
        profitSubs.map(p => (
          <div
            key={p.subMerchantId}
            className={`${styles.card} ${styles.activeBalance}`}
          >
            <h3 className={styles.cardTitle}>
              {p.name ?? p.subMerchantId}
            </h3>
            <p className={styles.cardValue}>
              {p.profit.toLocaleString('id-ID', {
                style: 'currency',
                currency: 'IDR'
              })}
            </p>
          </div>
        ))
      ) : (
        // render card kosong kalau tidak ada data
        <div className={`${styles.card} ${styles.noDataCard}`}>
          <h3 className={styles.cardTitle}>No data</h3>
          <p className={styles.cardValue}>–</p>
        </div>
      )}
    </div>
  )}
</section>
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
<select
  value={statusFilter}
  onChange={e => setStatusFilter(e.target.value)}
>
  <option value="all">All Status</option>
  <option value="SUCCESS">SUCCESS</option>
  <option value="PAID">PAID</option>
  <option value="PENDING">PENDING</option>
  <option value="EXPIRED">EXPIRED</option>
</select>

          <button
            onClick={() => {
              api.get('/admin/merchants/dashboard/export-all', {
                params: buildParams(),
                responseType: 'blob'
    }).then(r => {
      const url = URL.createObjectURL(new Blob([r.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = 'dashboard-all.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    })
  }}
  className={styles.exportBtn}
>
  <FileText size={16} /> Export Semua
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
                    <th>Paid At</th>           {/* baru */}
                    <th>Settled At</th>        {/* baru */}
                    <th>TRX ID</th>
                    <th>RRN</th>
                    <th>Player ID</th>
                    <th>PG</th>        
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
                            {t.paymentReceivedTime
                                      ? new Date(t.paymentReceivedTime)
                                              .toLocaleString('id-ID', { dateStyle:'short', timeStyle:'short' })
                                           : '-'}
                                             </td>
                        <td>
                       {t.settlementTime
                         ? new Date(t.settlementTime)
                        .toLocaleString('id-ID', { dateStyle:'short', timeStyle:'short' })
                        : '-'}
                     </td>
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
                      <td>{t.channel}</td>            {/* ← baru */}
                      <td>{t.amount.toLocaleString('id-ID', { style:'currency', currency:'IDR' })}</td>
                      <td>{t.feeLauncx.toLocaleString('id-ID', { style:'currency', currency:'IDR' })}</td>
                      <td>{t.feePg.toLocaleString('id-ID', { style:'currency', currency:'IDR' })}</td>
                      <td className={styles.netSettle}>{t.netSettle.toLocaleString('id-ID', { style:'currency', currency:'IDR' })}</td>
<td>
  {t.status || '-'}
</td>


<td>
  {t.settlementStatus === 'WAITING'
    ? 'PENDING'
    : t.settlementStatus === 'UNSUCCESSFUL'
      ? 'FAILED'
      : (t.settlementStatus || '-')}
</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
)}
<div className={styles.pagination}>
              <div>
                Rows
                <select
                  value={perPage}
                  onChange={e => {
                    setPerPage(+e.target.value)
                    setPage(1)
                  }}
                >
                  {[10, 20, 50].map(n => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </div>
              <div>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                  ‹
                </button>
                <span>{page}/{totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                  ›
                </button>
              </div>
            </div>


        </section>



   {/* === WITHDRAWAL HISTORY ===================================================== */}
      <section className={styles.tableSection} style={{ marginTop: 32 }}>
        <h2>Withdrawal History</h2>
        {loadingWd ? (
          <div className={styles.loader}>Loading withdrawals…</div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Ref ID</th>
                  <th>Account Name</th>
                  <th>Alias</th>
                  <th>Account No.</th>
                  <th>Bank Code</th>
                  <th>Bank Name</th>
                  <th>Branch</th>
                  <th>Wallet/Submerchant</th>
                  <th>Withdrawal Fee</th>

                  <th>Amount</th>
                  <th>Net Amount</th>
                   <th>PG Fee</th>

                  <th>PG Trx ID</th>
                  <th>In Process</th>
                  <th>Status</th>
                  <th>Completed At</th>
                </tr>
              </thead>
              <tbody>
                {withdrawals.length ? (
                  withdrawals.map(w => (
                    <tr key={w.id}>
                      <td>
                        {new Date(w.createdAt).toLocaleString('id-ID', {
                          dateStyle: 'short',
                          timeStyle: 'short'
                        })}
                      </td>
                      <td>{w.refId}</td>
                      <td>{w.accountName}</td>
                      <td>{w.accountNameAlias}</td>
                      <td>{w.accountNumber}</td>
                      <td>{w.bankCode}</td>
                      <td>{w.bankName}</td>
                      <td>{w.branchName ?? '-'}</td>
                      <td>{w.wallet}</td>
                      <td>
                        {(w.amount - (w.netAmount ?? 0)).toLocaleString('id-ID', {
                          style: 'currency',
                          currency: 'IDR'
                        })}
                      </td>
                      <td>
                        {w.amount.toLocaleString('id-ID', {
                          style: 'currency',
                          currency: 'IDR'
                        })}
                      </td>
                      <td>
                        {w.netAmount != null
                          ? w.netAmount.toLocaleString('id-ID', {
                              style: 'currency',
                              currency: 'IDR'
                            })
                          : '-'}
                      </td>

                     <td>
                        {w.pgFee != null
                          ? w.pgFee.toLocaleString('id-ID', {
                              style: 'currency',
                              currency: 'IDR'
                            })
                          : '-'}
                      </td>
                      <td>{w.paymentGatewayId ?? '-'}</td>
                      <td>{w.isTransferProcess ? 'Yes' : 'No'}</td>
                      <td>{w.status}</td>
                      <td>
                        {w.completedAt
                          ? new Date(w.completedAt).toLocaleString('id-ID', {
                              dateStyle: 'short',
                              timeStyle: 'short'
                            })
                          : '-'}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={17} className={styles.noData}>
                      No withdrawals
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
      </main>
    </div>
  )
}
