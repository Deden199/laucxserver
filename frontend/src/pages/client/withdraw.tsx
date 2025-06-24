// File: frontend/src/pages/client/withdraw.tsx
'use client'

import { useState, useEffect } from 'react'
import apiClient from '@/lib/apiClient'
import styles from './WithdrawPage.module.css'
import { ArrowUpDown, CheckCircle } from 'lucide-react'

interface Withdrawal {
  id: string
  refId: string
  bankName: string
  accountNumber: string
  amount: number
  status: string
  createdAt: string
}

export default function WithdrawPage() {
  // State
  const [balance, setBalance] = useState(0)
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])
  const [loading, setLoading] = useState(true)

  const [form, setForm] = useState({
    bankCode: '',
    accountNumber: '',
    accountName: '',
    amount: ''
  })
  const [holder, setHolder] = useState('')
  const [isValid, setIsValid] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState({ validating: false, submitting: false })

  const [searchRef, setSearchRef] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Pagination
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)

  // Load saved account details
  useEffect(() => {
    const saved = localStorage.getItem('withdrawAccount')
    if (saved) {
      const { bankCode, accountNumber, accountName } = JSON.parse(saved)
      setForm(f => ({ ...f, bankCode, accountNumber, accountName }))
      setIsValid(true)
    }
  }, [])

  // Fetch balance & history
  useEffect(() => {
    setLoading(true)
    Promise.all([
      apiClient.get('/client/dashboard'),
apiClient.get<{ data: Withdrawal[] }>('/client/withdrawals')    ])
      .then(([dash, hist]) => {
        setBalance(dash.data.balance)
        setWithdrawals(hist.data.data)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  // Handle form changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setForm(f => ({ ...f, [name]: value }))
    if (name === 'amount') {
      const num = Number(value)
      if (!num || num <= 0) setError('Masukkan jumlah valid')
      else if (num > balance) setError('Jumlah melebihi saldo')
      else setError('')
    } else {
      setError('')
    }
  }

  // Validate account via Hilogate
  const validateAccount = async () => {
    setBusy(b => ({ ...b, validating: true }))
    setError('')
    try {
      const res = await apiClient.post(
        '/client/withdrawals/validate-account',
        { bank_code: form.bankCode, account_number: form.accountNumber }
      )
      const { account_holder, status } = res.data
      if (status === 'valid') {
        setHolder(account_holder)
        setIsValid(true)
        localStorage.setItem(
          'withdrawAccount',
          JSON.stringify({
            bankCode:      form.bankCode,
            accountNumber: form.accountNumber,
            accountName:   account_holder
          })
        )
        setForm(f => ({ ...f, accountName: account_holder }))
      } else {
        throw new Error('Akun tidak valid')
      }
    } catch (e: any) {
      setHolder('')
      setIsValid(false)
      setError(e.response?.data?.message || e.message || 'Akun tidak valid')
    } finally {
      setBusy(b => ({ ...b, validating: false }))
    }
  }

  // Submit withdrawal
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid || error) return
    setBusy(b => ({ ...b, submitting: true }))
    try {
      await apiClient.post('/client/withdrawals', {
        ref_id:         `wd-${Date.now()}`,
        account_name:   form.accountName,
        account_number: form.accountNumber,
        bank_code:      form.bankCode,
        amount:         Number(form.amount),
      })
      // Refresh data
      setLoading(true)
      const [dash, hist] = await Promise.all([
        apiClient.get('/client/dashboard'),
        apiClient.get<Withdrawal[]>('/client/withdrawals'),
      ])
      setBalance(dash.data.balance)
      setWithdrawals(hist.data)
      // Reset amount only
      setForm(f => ({ ...f, amount: '' }))
      setError('')
      setIsValid(false)
    } catch {
      setError('Gagal submit withdrawal')
    } finally {
      setBusy(b => ({ ...b, submitting: false }))
      setLoading(false)
    }
  }

  // Filter & paginate
  const filtered = withdrawals.filter(w => {
    if (searchRef && !w.refId.includes(searchRef)) return false
    if (statusFilter && w.status !== statusFilter) return false
    const d = new Date(w.createdAt)
    if (dateFrom && d < new Date(dateFrom)) return false
    if (dateTo && d > new Date(`${dateTo}T23:59:59`)) return false
    return true
  })
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
  const pageData = filtered.slice((page - 1) * perPage, page * perPage)

  return (
    <div className={styles.page}>
      {/* Saldo Card */}
      <div className={styles.balanceCard}>
        <div className={styles.balanceTitle}>Balance</div>
        <div className={styles.balanceValue}>Rp {balance.toLocaleString()}</div>
      </div>

      {/* Main Grid */}
      <div className={styles.grid}>
        {/* New Withdrawal Form */}
        <section className={styles.card}>
          <h3 className={styles.cardTitle}>New Withdrawal</h3>
          <form className={styles.form} onSubmit={onSubmit}>
            {/* Bank */}
            <div className={styles.field}>
              <label>Bank</label>
              <select
                name="bankCode"
                value={form.bankCode}
                onChange={handleChange}
                required
              >
                <option value="">— Pilih Bank —</option>
                <option value="bca">BCA</option>
                <option value="bni">BNI</option>
                <option value="mandiri">Mandiri</option>
              </select>
            </div>

            {/* Account Number */}
            <div className={styles.field}>
              <label>Account Number</label>
              <input
                name="accountNumber"
                value={form.accountNumber}
                onChange={handleChange}
                required
              />
            </div>

            {/* Account Name */}
            <div className={styles.field}>
              <label>Account Name</label>
              <div className={styles.readonlyWrapper}>
                <input
                  name="accountName"
                  value={form.accountName}
                  readOnly
                  placeholder="Klik Validate untuk isi"
                />
                {isValid && (
                  <CheckCircle
                    className={styles.validIcon}
                    size={20}
                    color="#10B981"
                  />
                )}
              </div>
            </div>

            {/* Amount */}
            <div className={styles.field}>
              <label>Amount</label>
              <input
                name="amount"
                type="number"
                value={form.amount}
                onChange={handleChange}
                placeholder="Masukkan jumlah"
                required
              />
            </div>

            {/* Actions & Error */}
            <div className={styles.actions}>
              <button
                type="button"
                onClick={validateAccount}
                disabled={busy.validating}
                className={styles.btnWarn}
              >
                {busy.validating ? 'Validating…' : 'Validate'}
              </button>
              <button
                type="submit"
                disabled={!isValid || !!error || busy.submitting}
                className={styles.btnPrimary}
              >
                {busy.submitting ? 'Submitting…' : 'Submit'}
              </button>
            </div>
            {error && <p className={styles.error}>{error}</p>}
          </form>
        </section>

        {/* Withdrawal History */}
        <section className={styles.historySection}>
          {/* Filters */}
          <div className={styles.filters}>
            <input
              className={styles.input}
              placeholder="Search Ref ID…"
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
              <option value="PENDING">PENDING</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="FAILED">FAILED</option>
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

          {/* Table */}
          <div className={styles.tableWrapper}>
            {loading ? (
              <p>Loading…</p>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    {[
                      'Date',
                      'Ref ID',
                      'Bank',
                      'Account',
                      'Amount',
                      'Status',
                      'Succes Date'
                    ].map(h => (
                      <th key={h}>
                        {h}
                        <ArrowUpDown
                          size={14}
                          className={styles.sortIcon}
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageData.length === 0 ? (
                    <tr>
                      <td colSpan={7} className={styles.noData}>
                        No withdrawals
                      </td>
                    </tr>
                  ) : (
                    pageData.map(w => (
                      <tr key={w.id}>
                        <td>
                          {new Date(w.createdAt).toLocaleDateString()}
                        </td>
                        <td>{w.refId}</td>
                        <td>{w.bankName}</td>
                        <td>{w.accountNumber}</td>
                        <td>Rp {w.amount.toLocaleString()}</td>
                        <td>
                          <span
                            className={styles[`status${w.status}`]}
                          >
                            {w.status}
                          </span>
                        </td>
                        <td>
                          <button className={styles.syncBtn}>
                            Sync Status
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          <div className={styles.pagination}>
            <div>
              Rows per page:
              <select
                value={perPage}
                onChange={e => {
                  setPerPage(+e.target.value)
                  setPage(1)
                }}
              >
                {[5, 10, 20].map(n => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <button
                onClick={() => setPage(p => Math.max(p - 1, 1))}
                disabled={page === 1}
              >
                ‹
              </button>
              <span>
                {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(p + 1, totalPages))}
                disabled={page === totalPages}
              >
                ›
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
