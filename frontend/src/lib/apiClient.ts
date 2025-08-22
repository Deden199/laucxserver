// File: frontend/src/lib/apiClient.ts
import axios, { AxiosError } from 'axios';

interface ErrorPayload {
  code?: string;
  message?: string;
}

const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || '',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

let hasRedirected = false;

// Request interceptor: pasang Authorization jika ada
apiClient.interceptors.request.use(
  config => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('clientToken');
      if (token) {
        config.headers = config.headers || {};
        config.headers['Authorization'] = `Bearer ${token}`;
      }
    }
    return config;
  },
  err => Promise.reject(err)
);

// Response interceptor: expired token -> clear & redirect
apiClient.interceptors.response.use(
  response => response,
  async (error: AxiosError) => {
    const resp = error.response;
    if (!resp) return Promise.reject(error);

    const errData = (resp.data as any)?.error as ErrorPayload | undefined;
    const errorCode = errData?.code;
    const errorMessage = errData?.message || (resp.data as any)?.message || '';

    const isAuthError =
      resp.status === 401 &&
      (errorCode === 'TOKEN_EXPIRED' ||
        errorCode === 'INVALID_TOKEN' ||
        /token/i.test(errorMessage) &&
          (/expired/i.test(errorMessage) || /invalid/i.test(errorMessage)));

    if (isAuthError && typeof window !== 'undefined') {
      localStorage.removeItem('clientToken');
      if (!hasRedirected) {
        hasRedirected = true;
        window.location.href = '/client/login';
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;

