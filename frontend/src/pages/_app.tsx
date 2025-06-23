// src/pages/_app.tsx
import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { useRouter } from 'next/router'
import AdminLayout from '@/components/layouts/AdminLayout'
import ClientLayout from '@/components/layouts/ClientLayout'

export default function MyApp({ Component, pageProps }: AppProps) {
  const { pathname } = useRouter()

  // Halaman-halaman yang tidak perlu layout
  const noAdminLayout   = ['/login']
  const noClientLayout  = ['/client/login']

  // 1) Jika ini halaman login admin, render tanpa layout
  if (noAdminLayout.includes(pathname)) {
    return <Component {...pageProps} />
  }

  // 2) Jika URL diawali /client
  if (pathname.startsWith('/client')) {
    // 2a) /client/login juga tanpa layout
    if (noClientLayout.includes(pathname)) {
      return <Component {...pageProps} />
    }
    // 2b) halaman client lainnya → ClientLayout
    return (
      <ClientLayout>
        <Component {...pageProps} />
      </ClientLayout>
    )
  }

  // 3) Halaman selain /client dan bukan /login → AdminLayout
  return (
    <AdminLayout>
      <Component {...pageProps} />
    </AdminLayout>
  )
}
