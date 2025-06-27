// File: src/pages/client/integration.tsx
'use client'
import { NextPage } from 'next'
import React from 'react'
import styles from './DocsPage.module.css'

/**
 * Dokumentasi lengkap integrasi Launcx API untuk partner‑client.
 * Menjelaskan header otentikasi, dua flow transaksi (Embed & Redirect),
 * struktur request/response, callback, dan fitur dashboard.
 */

const IntegrationDocs: NextPage & { disableLayout?: boolean } = () => (
  <main className={styles.container}>
    {/* ───────────────────────────────────────────────  TITLE  */}
    <h1 className={styles.heading1}>Launcx API Integration Guide</h1>

    {/* ───────────────────────────────────────────── 1. AUTH  */}
    <section className={styles.section}>
      <h2 className={styles.heading2}>1. Authentication</h2>
      <p className={styles.bodyText}>
        Setiap request ke <code>/api/v1/*</code> <strong>wajib</strong> menyertakan header berikut:
      </p>
      <ul className={styles.list}>
        <li><code className={styles.codeInline}>Content-Type: application/json</code></li>
        <li><code className={styles.codeInline}>x-api-key: &lt;YOUR_API_KEY&gt;</code></li>
        <li><code className={styles.codeInline}>x-timestamp: &lt;Unix TS ms&gt;</code></li>
      </ul>
      <p className={styles.bodyText}>
        <code>x-timestamp</code> mencegah replay‑attack (ditolak &gt; 5 menit).
      </p>
      <pre className={styles.codeBlock}>
{`import axios from 'axios'

const api = axios.create({
  baseURL: 'https://launcx.com/api/v1',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': process.env.LAUNCX_API_KEY!,
  },
})

api.interceptors.request.use(cfg => {
  cfg.headers['x-timestamp'] = Date.now().toString()
  return cfg
})

export default api`}
      </pre>
    </section>

    {/* ─────────────────────────────────────────── 2. CREATE ORDER  */}
    <section className={styles.section}>
      <h2 className={styles.heading2}>2. Create Transaction / Order</h2>
      <p className={styles.bodyText}>
        Endpoint tunggal <code className={styles.codeInline}>POST /api/v1/payments</code> mendukung dua
        <em>flow</em> pembayaran:
      </p>
      <ol className={styles.list}>
        <li><strong>Embed Flow</strong> – merespons JSON berisi <code>qrPayload</code>.</li>
        <li><strong>Redirect Flow</strong> – merespons <code>303 See Other</code> dengan header <code>Location</code>.</li>
      </ol>

      {/* ----------   Embed Flow  ---------------------------------- */}
      <h3 className={styles.heading3}>2.1 Embed Flow</h3>
      <pre className={styles.codeBlock}>
{`POST /api/v1/payments
Headers: (lihat Authentication)
Body:
{
  "price": 50000,
  "playerId": "gamer_foo",
  "flow": "embed"        // atau hilangkan—default embed
}`}
      </pre>
      <p className={styles.bodyText}>Response <code>201 Created</code>:</p>
      <pre className={styles.codeBlock}>
{`{
  "success": true,
  "data": {
    "orderId": "685s6eb9263c75af53ba84b1",
    "checkoutUrl": "https://payment.launcx.com/order/{orderId}",
    "qrPayload": "0002010102122667...47B8",
    "playerId": "gamer_foo",
    "totalAmount": 50000
  }
}`}
      </pre>

      {/* ----------   Redirect Flow  ------------------------------- */}
      <h3 className={styles.heading3}>2.2 Redirect Flow</h3>
      <pre className={styles.codeBlock}>
{`POST /api/v1/payments
Headers: (sama)
Body:
{
  "price": 50000,
  "playerId": "gamer_foo",
  "flow": "redirect"
}`}
      </pre>
      <p className={styles.bodyText}>Response <code>303 See Other</code>:</p>
      <pre className={styles.codeBlock}>
{`HTTP/1.1 303 See Other
Location: https://payment.launcx.com/order/685e6f36263c75af53ba84b3`}
      </pre>

      <h4 className={styles.heading3}>Contoh cURL (Embed)</h4>
      <pre className={styles.codeBlock}>
{`curl -i -X POST https://launcx.com/api/v1/payments \
  -H "Content-Type: application/json" \
  -H "x-api-key: <YOUR_API_KEY>" \
  -H "x-timestamp: $(($(date +%s)*1000))" \
  -d '{
        "price": 50000,
        "playerId": "gamer_foo"
      }'`}
      </pre>

      <h4 className={styles.heading3}>Contoh Axios (Redirect)</h4>
      <pre className={styles.codeBlock}>
{`import api from '@/lib/api'

async function payRedirect() {
  const res = await api.post('/payments', {
    price: 50000,
    playerId: 'gamer_foo',
    flow: 'redirect',
  }, { validateStatus: () => true })

  if (res.status === 303 && res.headers.location) {
    window.location.href = res.headers.location
  } else {
    console.error('Unexpected response', res.data)
  }
}`}
      </pre>
    </section>
    {/* --- REGISTER CALLBACK URL --- */}
      <section className={styles.section}>
        <h2 className={styles.heading2}>3. Register Callback URL</h2>
        <p className={styles.bodyText}>
          Daftarkan endpoint di server Anda yang akan menerima notifikasi saat status transaksi berubah.
        </p>
        <pre className={styles.codeBlock}>
          <code>{`POST /client/callback-url
Authorization: Bearer <YOUR_JWT_TOKEN>
Content-Type: application/json

Body:
{
  "url": "https://your-server.com/api/transactions/callback"
}`}</code>
        </pre>
        <p className={styles.bodyText}>
          Setelah mendaftar, kunjungi halaman Callback Settings di Dashboard Anda untuk melihat nilai <strong>Callback Secret</strong>.
          Simpan secret ini di environment server Anda untuk memverifikasi signature pada setiap callback.
        </p>
      </section>

      {/* --- HANDLE CALLBACK --- */}
      <section className={styles.section}>
        <h2 className={styles.heading2}>4. Handle Callback</h2>
        <p className={styles.bodyText}>
          Launcx akan melakukan POST ke URL Anda saat transaksi <strong>SUCCESS</strong> atau <strong>DONE</strong>.
        </p>
        <pre className={styles.codeBlock}>
          <code>{`{
  "orderId": "685d4578f2745f068c635f17",
  "status": "SUCCESS",
  "amount": 50000,
  "timestamp": "2025-06-26T14:30:00Z",
  "nonce": "uuid-v4"
}`}</code>
        </pre>
        <p className={styles.bodyText}>
          Signature HMAC-SHA256 ada di header <code>X-Callback-Signature</code>.
          Verifikasi di server Anda menggunakan Callback Secret dari Dashboard:
        </p>
        <pre className={styles.codeBlock}>
          <code>{`import crypto from 'crypto'

function verifyCallback(body, signature, secret) {
  const payload = JSON.stringify(body)
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')
  return signature === expected
}`}</code>
        </pre>
      </section>

      {/* --- CLIENT DASHBOARD & WITHDRAW --- */}
      <section className={styles.section}>
        <h2 className={styles.heading2}>5. Client Dashboard & Withdraw</h2>
        <p className={styles.bodyText}>
          Akses Dashboard di <code>/client/dashboard</code>. Fitur:
        </p>
        <ul className={styles.list}>
          <li><strong>Saldo Aktif</strong>: Saldo terkini.</li>
          <li><strong>Total Transaksi</strong>: Ringkasan transaksi.</li>
          <li><strong>Riwayat Transaksi</strong>: Daftar semua transaksi.</li>
          <li><strong>Callback Settings</strong>: Daftar URL + Callback Secret.</li>
          <li><strong>Withdraw</strong>: Ajukan penarikan dana.</li>
        </ul>
        <pre className={styles.codeBlock}>
          <code>{`POST /client/dashboard/withdraw
Content-Type: application/json

{
  "bank_code": "bca",
  "account_number": "1234567890",
  "amount": 25000
}`}</code>
        </pre>
      </section>

      {/* --- END-TO-END FLOW --- */}
      <section className={styles.section}>
        <h2 className={styles.heading2}>6. End-to-End Flow</h2>
        <ol className={styles.list}>
          <li>Login & dapatkan <code>apiKey</code></li>
          <li>Panggil <code>/payments/create-order</code> dari server Anda.</li>
          <li>Redirect user ke Checkout URL.</li>
          <li>Terima Callback, verifikasi signature.</li>
          <li>Proses data dan tampilkan status di aplikasi Anda.</li>
          <li>Monitor saldo & tarik dana di Client Dashboard.</li>
        </ol>
      </section>


    </main>
  )


IntegrationDocs.disableLayout = true

export default IntegrationDocs
