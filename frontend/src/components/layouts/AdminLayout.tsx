'use client';

import { ReactNode, useState, useEffect } from 'react';
import Link from 'next/link';
import styles from './Layout.module.css';

interface LayoutProps { children: ReactNode; }

export default function Layout({ children }: LayoutProps) {
  const [open, setOpen] = useState(false);

  // Lock scroll saat sidebar terbuka
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const nav = [
    { label: 'Dashboard',    href: '/dashboard' },
    { label: 'Merchants',    href: '/admin/merchants' },
    
    { label: 'API Clients',  href: '/admin/clients' },
    { label: 'PG Providers', href: '/admin/pg-providers' },
  ];

  return (
    <div className={styles.container}>
      <aside className={`${styles.sidebar} ${open ? styles.sidebarOpen : ''}`}>
        <div className={styles.logo}>Admin Panel</div>
        <nav className={styles.nav}>
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
          <h1 className={styles.title}>Welcome, Admin</h1>
          <button className={styles.actionBtn}>New Merchant</button>
        </header>
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
