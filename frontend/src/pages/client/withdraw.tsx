import { useState } from 'react'
import { useRouter } from 'next/router'
import api from '@/lib/api'
import styles from '@/styles/ClientDashboard.module.css'

export default function WithdrawPage() {
  const [amt,setAmt] = useState(0)
  const [err,setErr] = useState('')
  const router = useRouter()

  async function onSubmit(e:any) {
    e.preventDefault()
    try {
      await api.post('/client/withdraw',{ amount:amt })
      router.push('/client/dashboard')
    } catch {
      setErr('Gagal proses withdraw')
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h2>Permintaan Withdraw</h2>
        {err && <p className={styles.error}>{err}</p>}
        <form onSubmit={onSubmit} className={styles.form}>
          <input
            type="number" value={amt}
            onChange={e=>setAmt(+e.target.value)}
            placeholder="Jumlah withdraw" required
          />
          <button type="submit">Kirim</button>
        </form>
      </div>
    </div>
  )
}
