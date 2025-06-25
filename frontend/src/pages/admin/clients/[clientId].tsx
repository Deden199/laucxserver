'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import api from '@/lib/api'
import { useRequireAuth } from '@/hooks/useAuth'
import styles from './editClient.module.css'

type Client = {
  id: string
  name: string
  apiKey: string
  apiSecret: string
  isActive: boolean
  feePercent: number
  feeFlat: number
}

export default function EditClientPage() {
  useRequireAuth()
  const router = useRouter()
  const { clientId } = router.query as { clientId: string }

  const [client, setClient]           = useState<Client | null>(null)
  const [name, setName]               = useState('')
  const [isActive, setIsActive]       = useState(true)
  const [feePercent, setFeePercent]   = useState<number>(0)
  const [feeFlat, setFeeFlat]         = useState<number>(0)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')

  useEffect(() => {
    if (!clientId) return
    api.get<Client>(`/admin/clients/${clientId}`)
      .then(res => {
        const c = res.data
        setClient(c)
        setName(c.name)
        setIsActive(c.isActive)
        setFeePercent(c.feePercent)
        setFeeFlat(c.feeFlat)
      })
      .catch(() => setError('Gagal memuat data client'))
  }, [clientId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Name tidak boleh kosong')
      return
    }
    setLoading(true)
    setError('')
    try {
      await api.put(`/admin/clients/${clientId}`, {
        name: name.trim(),
        isActive,
        feePercent,
        feeFlat
      })
      router.push('/admin/clients')
    } catch (e: any) {
      setError(e.response?.data?.error || 'Gagal menyimpan perubahan')
    } finally {
      setLoading(false)
    }
  }

  if (!client) return <div className={styles.loading}>Loading...</div>

  return (
    <div className={styles.container}>
      <h1 className={styles.heading}>Edit Client</h1>
      {error && <div className={styles.error}>{error}</div>}
      <form onSubmit={handleSubmit} className={styles.form}>
        <label>
          Name
          <input value={name} onChange={e => setName(e.target.value)} className={styles.input} />
        </label>
        <label>
          Active
          <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} className={styles.checkbox} />
        </label>
        <label>
          Fee %
          <input
            type="number" step="0.1" min={0} max={100}
            value={feePercent}
            onChange={e => setFeePercent(parseFloat(e.target.value) || 0)}
            className={styles.input}
          />
        </label>
        <label>
          Fee Flat
          <input
            type="number" step="0.01" min={0}
            value={feeFlat}
            onChange={e => setFeeFlat(parseFloat(e.target.value) || 0)}
            className={styles.input}
          />
        </label>
        <button type="submit" disabled={loading} className={styles.btnSave}>
          {loading ? 'Menyimpan...' : 'Save Changes'}
        </button>
      </form>
    </div>
  )
}
