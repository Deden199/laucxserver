// src/lib/apiClient.ts
import axios from 'axios'

const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,  // sudah mencakup “/api/v1”
})

apiClient.interceptors.request.use(cfg => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('clientToken')
    if (token) cfg.headers!['Authorization'] = `Bearer ${token}`
  }
  return cfg
})

export default apiClient
