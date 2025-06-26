// File: src/pages/client/integration.tsx
'use client'
import { NextPage } from 'next'

import React, { useState, useEffect } from 'react'
import styles from './DocsPage.module.css'
import api from '@/lib/api'
const Docsss: NextPage & { disableLayout?: boolean } = () => {

/**
 * Halaman dokumentasi ini ditujukan untuk integrator sisi client,
 * yang ingin memanggil API Launcx dari server mereka.
 * Fokus pada penggunaan endpoint, pengiriman header, dan penanganan callback.
 */

  return (
    <main className={styles.container}>

      <h1 className={styles.heading1}>Launcx API Integration Guide</h1>

      {/* --- AUTHENTICATION --- */}
      <section className={styles.section}>
        <h2 className={styles.heading2}>1. Authentication</h2>
        <p className={styles.bodyText}>
          Semua request ke API Launcx harus memiliki header berikut untuk
          otorisasi dan keamanan:
        </p>
        <ul className={styles.list}>
          <li>
            <code className={styles.codeInline}>Content-Type: application/json</code>
          </li>
          <li>
            <code className={styles.codeInline}>x-api-key: &lt;YOUR_API_KEY&gt;</code>
          </li>
          <li>
            <code className={styles.codeInline}>x-timestamp: &lt;Unix timestamp ms&gt;</code>
          </li>
        </ul>
        <p className={styles.bodyText}>
          Timestamp digunakan untuk mencegah replay attack. Server akan
          menolak request jika selisihnya lebih dari 5 menit.
        </p>
        <pre className={styles.codeBlock}>
          <code>{`import axios from 'axios'

const api = axios.create({
  baseURL: 'https://launcx.com/api/v1',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': process.env.LAUNCX_API_KEY!,
  },
})

api.interceptors.request.use(config => {
  config.headers['x-timestamp'] = Date.now().toString()
  return config
})

export default api`}</code>
        </pre>
      </section>

      {/* --- CREATE ORDER --- */}
      <section className={styles.section}>
        <h2 className={styles.heading2}>2. Create Order</h2>
        <p className={styles.bodyText}>
          Endpoint ini membuat request pembayaran. Setelah berhasil,
          server akan merespon kode <code className={styles.codeInline}>303</code>
          dengan header <code className={styles.codeInline}>Location</code> yang
          berisi URL checkout.
        </p>
        <pre className={styles.codeBlock}>
          <code>{`POST /payments/create-order
Host: launcx.com
Headers: sesuai bagian Authentication

Body:
{
  "amount": 150000,    
  "currency": "IDR"
}`}</code>
        </pre>
        <pre className={styles.codeBlock}>
          <code>{`HTTP/1.1 303 See Other
Location: https://checkout.xmpl.com/session/abc123`}</code>
        </pre>
        <h3 className={styles.heading3}>Contoh cURL</h3>
        <pre className={styles.codeBlock}>
          <code>{`curl -i -X POST https://launcx.com/api/v1/payments/create-order \
  -H "Content-Type: application/json" \
  -H "x-api-key: <YOUR_API_KEY>" \
  -H "x-timestamp: $(($(date +%s)*1000))" \
  -d '{"amount":50000}'`}</code>
        </pre>
        <h3 className={styles.heading3}>Contoh Axios</h3>
        <pre className={styles.codeBlock}>
          <code>{`import api from '@/lib/api'

async function initiatePayment(amount: number) {
  const res = await api.post('/payments/create-order', { amount })
  if (res.status === 303 && res.headers.location) {
    return res.headers.location  // URL checkout
  }
  throw new Error('Create order failed: ' + JSON.stringify(res.data))
}`}</code>
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
}

Docsss.disableLayout = true

export default Docsss
