// File: src/pages/client/callback.tsx
'use client'

import { useState, useEffect } from 'react'
import { Bell, Copy } from 'lucide-react'
import apiClient from '@/lib/apiClient'
import styles from './CallbackPage.module.css'

export default function CallbackPage() {
  const [url, setUrl] = useState('')
  const [secret, setSecret] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)

  // Load existing callback URL & secret
  useEffect(() => {
    apiClient
      .get('/client/callback-url')  // adjusted path
      .then(res => {
        setUrl(res.data.callbackUrl || '')
        setSecret(res.data.callbackSecret || '')
      })
      .catch(() => {
        setMessage('❌ Gagal memuat data callback')
        setIsError(true)
      })
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setMessage('')
    setIsError(false)
    try {
      const res = await apiClient.post('/client/callback-url', { callbackUrl: url })  // adjusted
      setUrl(res.data.callbackUrl)
      if (res.data.callbackSecret) setSecret(res.data.callbackSecret)
      setMessage('✅ Callback URL & Secret berhasil disimpan!')
    } catch {
      setMessage('❌ Gagal menyimpan callback URL')
      setIsError(true)
    } finally {
      setSaving(false)
    }
  }

  const copySecret = () => {
    if (secret) {
      navigator.clipboard.writeText(secret)
      setMessage('🔑 Secret berhasil disalin!')
      setIsError(false)
    }
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <div className={styles.header}>
          <Bell size={24} />
          <h1 className={styles.title}>Callback Settings</h1>
        </div>

        <div className={styles.field}>
          <label htmlFor="cbUrl" className={styles.label}>Transactions Callback URL</label>
          <input
            id="cbUrl"
            type="url"
            className={styles.input}
            placeholder="https://your-domain.com/callback"
            value={url}
            onChange={e => setUrl(e.target.value)}
            disabled={saving}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Callback Secret</label>
          <div className={styles.secretWrapper}>
            <input
              type="text"
              className={styles.input}
              readOnly
              value={secret}
              placeholder="Secret will appear here"
            />
            <button
              type="button"
              className={styles.copyButton}
              onClick={copySecret}
            >
              <Copy size={16} />
            </button>
          </div>
        </div>

        <button
          className={styles.button}
          onClick={handleSave}
          disabled={saving || url.trim() === ''}
        >
          {saving ? 'Menyimpan…' : 'Simpan Callback'}
        </button>

        {message && (
          <p className={`${styles.message} ${!isError ? styles.success : ''}`}>
            {message}
          </p>
        )}
      </div>
    </div>
  )
}
