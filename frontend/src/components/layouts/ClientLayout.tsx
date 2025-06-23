'use client'

import { ReactNode, useState, useEffect } from 'react'
import Link from 'next/link'
import styles from './ClientLayout.module.css'

interface ClientLayoutProps {
  children: ReactNode
}

export default function ClientLayout({ children }: ClientLayoutProps) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  const nav = [
    { label: 'Dashboard', href: '/client/dashboard' },
    { label: 'Withdraw',  href: '/client/withdraw' },
  ]

  return (
    <div className={styles.container}>
      <aside className={`${styles.sidebar} ${open ? styles.open : ''}`}>
        <div className={styles.logo}>Partner Portal</div>
        <nav>
          {nav.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={styles.navItem}
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div
        className={`${styles.backdrop} ${open ? styles.backdropVisible : ''}`}
        onClick={() => setOpen(false)}
      />

      <div className={styles.main}>
        <header className={styles.header}>
          <button
            className={styles.burger}
            onClick={() => setOpen(o => !o)}
            aria-label="Toggle menu"
          >
            {open ? '✕' : '☰'}
          </button>
          <h1 className={styles.title}>Partner Dashboard</h1>
        </header>
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  )
}
