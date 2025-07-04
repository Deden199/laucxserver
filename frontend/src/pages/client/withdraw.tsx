'use client'
type ClientOption = { id: string; name: string };
import axios from 'axios'
// …

import { useState, useEffect } from 'react'
import apiClient from '@/lib/apiClient'
import {
  Plus,
  Wallet,
  Clock,
  FileText,
  X,
  CheckCircle,
  ArrowUpDown,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import styles from './WithdrawPage.module.css'

interface Withdrawal {
  id: string
  refId: string
  bankName: string
  accountNumber: string
  amount: number
  status: string
  createdAt: string
}

function deriveAlias(fullName: string) {
  const parts = fullName.trim().split(' ')
  if (parts.length === 1) return parts[0]
  return `${parts[0]} ${parts[parts.length-1][0]}.`
}


export default function WithdrawPage() {
  /* ──────────────── Dashboard data ──────────────── */
  const [balance, setBalance] = useState(0)
  const [pending, setPending] = useState(0)
const [pageError, setPageError] = useState('')

  /* ──────────────── Withdrawals list ──────────────── */
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])
  const [loading, setLoading] = useState(true)
// Parent–Child
const [children, setChildren]           = useState<ClientOption[]>([])
const [selectedChild, setSelectedChild] = useState<'all' | string>('all')

  /* ──────────────── Modal & Form state ──────────────── */
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
  bankCode: '',
  accountNumber: '',
  accountName: '',
  accountNameAlias: '',    // ← tambahkan
  bankName: '',            // ← tambahkan
  branchName: '',          // ← tambahkan
  amount: '',
  })
  const [isValid, setIsValid] = useState(false)
  const [busy, setBusy] = useState({ validating: false, submitting: false })
  const [error, setError] = useState('')

  /* ──────────────── Filters & pagination ──────────────── */
  const [searchRef, setSearchRef] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)
const [banks, setBanks] = useState<{ code: string; name: string }[]>([])

  /* ──────────────── Initial fetch ──────────────── */
  useEffect(() => {
  apiClient.get<{ banks: { code: string; name: string }[] }>('/banks')
    .then(res => setBanks(res.data.banks))
    .catch(console.error)
}, [])

useEffect(() => {
  setLoading(true)
  setPageError('')            

  Promise.all([
    apiClient.get<{
      balance: number
      totalPending: number
      children: ClientOption[]
    }>('/client/dashboard', {
      params: { clientId: selectedChild }
    }),
    apiClient.get<{ data: Withdrawal[] }>('/client/withdrawals', {
      params: { clientId: selectedChild }
    }),
  ])
    .then(([dash, hist]) => {
      setBalance(dash.data.balance)
      setPending(dash.data.totalPending ?? 0)
      if (children.length === 0) setChildren(dash.data.children)
      setWithdrawals(hist.data.data)
    })
    .catch(console.error)
    .finally(() => setLoading(false))
}, [selectedChild])

  /* ──────────────── Helpers ──────────────── */
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target
    setForm(f => ({ ...f, [name]: value }))
    if (name === 'amount') {
      const n = +value
      if (!n || n <= 0) setError('Amount harus > 0')
      else if (n > balance) setError('Melebihi saldo')
      else setError('')
    } else setError('')
    if (name === 'bankCode' || name === 'accountNumber') {
        setForm(f => ({
          ...f,
          accountName:      '',
          accountNameAlias: '',
          bankName:         '',
          branchName:       '',
        }))
        setIsValid(false)
      }
    }
  

  const validateAccount = async () => {
    setBusy(b => ({ ...b, validating: true }))
    setError('')
    try {
      const { data } = await apiClient.post(
        '/client/withdrawals/validate-account',
        {
          bank_code: form.bankCode,
          account_number: form.accountNumber,
        },
      )
      if (data.status === 'valid') {
         const holder = data.account_holder as string
const bankObj = banks.find(b => b.code === form.bankCode);
 
  setForm(f => ({
          ...f,
          accountName:      holder,
          accountNameAlias: deriveAlias(holder),
            bankName:         bankObj?.name || '',
  branchName:       '', 
        }))
                setIsValid(true)
      } else throw new Error('Akun tidak valid')
    } catch (e: any) {
      setIsValid(false)
      setError(e.message || 'Akun tidak valid')
    } finally {
      setBusy(b => ({ ...b, validating: false }))
    }
  }

  const submit = async (e: React.FormEvent) => {
  e.preventDefault()
  if (!isValid || error) return
  setBusy(b => ({ ...b, submitting: true }))
  try {
    await apiClient.post(
      '/client/withdrawals',
      {
        account_number:     form.accountNumber,
        bank_code:          form.bankCode,
        account_name_alias: form.accountNameAlias,
        amount:             +form.amount,
      }
    )
    // refresh balance + history seperti biasa…
    const [d, h] = await Promise.all([
      apiClient.get('/client/dashboard'),
      apiClient.get<{ data: Withdrawal[] }>('/client/withdrawals'),
    ])
    setBalance(d.data.balance)
    setPending(d.data.totalPending ?? 0)
    setWithdrawals(h.data.data)
    setForm(f => ({
      ...f,
      amount: '',
      accountName:      '',
      accountNameAlias: '',
      bankName:         '',
      branchName:       '',
    }))
    setIsValid(false)
    setOpen(false)
  } catch (err: any) {
    if (axios.isAxiosError(err)) {
      setError(err.response?.data?.error || 'Submit gagal')
    } else {
      setError('Submit gagal')
    }
  } finally {
    setBusy(b => ({ ...b, submitting: false }))
  }
}


  const exportToExcel = () => {
    const rows = [
      ['Date', 'Ref ID', 'Bank', 'Account', 'Amount', 'Status'],
      ...withdrawals.map(w => [
        new Date(w.createdAt).toLocaleDateString(),
        w.refId,
        w.bankName,
        w.accountNumber,
        w.amount,
        w.status,
      ]),
    ]
    const ws = XLSX.utils.aoa_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Withdrawals')
    XLSX.writeFile(wb, 'withdrawals.xlsx')
  }

  /* ──────────────── Filtering & paging ──────────────── */
  const filtered = withdrawals.filter(w => {
    const d = new Date(w.createdAt)
    if (searchRef && !w.refId.includes(searchRef)) return false
    if (statusFilter && w.status !== statusFilter) return false
    if (dateFrom && d < new Date(dateFrom)) return false
    if (dateTo && d > new Date(`${dateTo}T23:59:59`)) return false
    return true
  })
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
  const pageData = filtered.slice((page - 1) * perPage, page * perPage)

  /* ──────────────── JSX ──────────────── */
  return (
    
  <div className={styles.page}>
    {pageError && <p className={styles.pageError}>{pageError}</p>}
          {children.length > 0 && (
  <div className={styles.childSelector}>
    <label>Pilih Child:&nbsp;</label>
    <select
      value={selectedChild}
      onChange={e => setSelectedChild(e.target.value as any)}
    >
      <option value="all">Semua Child</option>
      {children.map(c => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
    </select>
  </div>
)}

      {/* === STAT CARDS ===================================================== */}
      <div className={styles.statsGrid}>
        {/* Active balance */}
        <div className={`${styles.statCard} ${styles.activeCard}`}>
          <Wallet size={28} />
          <div>
            <p className={styles.statTitle}>Active Balance</p>
            <p className={styles.statValue}>
              Rp {balance.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Pending balance */}
        <div className={`${styles.statCard} ${styles.pendingCard}`}>
          <Clock size={28} />
          <div>
            <p className={styles.statTitle}>Pending Balance</p>
            <p className={styles.statValue}>
              Rp {pending.toLocaleString()}
            </p>
          </div>
        </div>

        {/* New withdrawal button */}
        <button className={styles.newBtn} onClick={() => setOpen(true)}>
          <Plus size={18} /> New Withdrawal
        </button>
      </div>

      {/* === HISTORY ======================================================= */}
      <section className={styles.historyCard}>
        <div className={styles.historyHeader}>
          <h3>Withdrawal History</h3>
          <button onClick={exportToExcel} className={styles.exportBtn}>
            <FileText size={16} /> Excel
          </button>
        </div>

        {/* filters */}
        <div className={styles.filters}>
          <input
            className={styles.input}
            placeholder="Search Ref"
            value={searchRef}
            onChange={e => {
              setSearchRef(e.target.value)
              setPage(1)
            }}
          />
          <select
            className={styles.select}
            value={statusFilter}
            onChange={e => {
              setStatusFilter(e.target.value)
              setPage(1)
            }}
          >
            <option value="">All Status</option>
            <option>PENDING</option>
            <option>COMPLETED</option>
            <option>FAILED</option>
          </select>
          <input
            type="date"
            className={styles.input}
            value={dateFrom}
            onChange={e => {
              setDateFrom(e.target.value)
              setPage(1)
            }}
          />
          <input
            type="date"
            className={styles.input}
            value={dateTo}
            onChange={e => {
              setDateTo(e.target.value)
              setPage(1)
            }}
          />
        </div>

        {/* table */}
        <div className={styles.tableWrap}>
          {loading ? (
            <p>Loading…</p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  {['Date', 'Ref ID', 'Bank', 'Account', 'Amount', 'Status'].map(
                    h => (
                      <th key={h}>
                        {h}
                        <ArrowUpDown size={14} className={styles.sortIcon} />
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {pageData.length ? (
                  pageData.map(w => (
                    <tr key={w.id}>
                      <td>{new Date(w.createdAt).toLocaleDateString()}</td>
                      <td>{w.refId}</td>
                      <td>{w.bankName}</td>
                      <td>{w.accountNumber}</td>
                      <td>Rp {w.amount.toLocaleString()}</td>
                      <td>
                        <span className={styles[`s${w.status}`]}>
                          {w.status}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className={styles.noData}>
                      No data
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* pagination */}
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
              {[5, 10, 20].map(n => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </div>
          <div>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              ‹
            </button>
            <span>
              {page}/{totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              ›
            </button>
          </div>
        </div>
      </section>

      {/* === MODAL ========================================================= */}
      {open && (
        <div
          className={styles.modalOverlay}
          onClick={() => setOpen(false)}
        >
          <div
            className={styles.modal}
            onClick={e => e.stopPropagation()}
          >
            <button
              className={styles.closeBtn}
              onClick={() => setOpen(false)}
            >
              <X size={18} />
            </button>
            <h3 className={styles.modalTitle}>New Withdrawal</h3>

            <form className={styles.form} onSubmit={submit}>
              {/* bank */}
              <div className={styles.field}>
                <label>Bank</label>
<select name="bankCode" value={form.bankCode} onChange={handleChange} required>
  <option value="">— Pilih Bank —</option>
  {banks.map(b => (
    <option key={b.code} value={b.code}>{b.name}</option>
  ))}
</select>

              </div>

              {/* account number */}
              <div className={styles.field}>
                <label>Account Number</label>
                <input
                  name="accountNumber"
                  value={form.accountNumber}
                  onChange={handleChange}
                  required
                />
              </div>

              {/* account name */}
              <div className={styles.field}>
                <label>Account Name</label>
                <div className={styles.readonlyWrapper}>
                  <input
                    readOnly
                    value={form.accountName}
                    placeholder="Isi otomatis setelah validasi"
                  />
                  {isValid && (
                    <CheckCircle className={styles.validIcon} size={18} />
                  )}
                </div>
              </div>

              {/* amount */}
              <div className={styles.field}>
                <label>Amount</label>
                <input
                  type="number"
                  name="amount"
                  value={form.amount}
                  onChange={handleChange}
                  required
                />
              </div>

              {/* actions */}
              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.btnWarn}
                  onClick={validateAccount}
                  disabled={busy.validating}
                >
                  {busy.validating ? 'Validating…' : 'Validate'}
                </button>
                <button
                  type="submit"
                  className={styles.btnPrimary}
                  disabled={!isValid || !!error || busy.submitting}
                >
                  {busy.submitting ? 'Submitting…' : 'Submit'}
                </button>
              </div>

              {error && <p className={styles.error}>{error}</p>}
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
