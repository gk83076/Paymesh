import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

const api = axios.create({
  baseURL: BASE_URL.endsWith('/api') ? BASE_URL : `${BASE_URL}/api`,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
})

api.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const message = err.response?.data?.error?.message || err.message || 'Unknown error'
    return Promise.reject(new Error(message))
  }
)

// ── Transfer ──────────────────────────────────────────────────────────────────
export const initiateTransfer = (payload) => api.post('/transfer', payload)
export const getTransfer = (id) => api.get(`/transfer/${id}`)
export const listTransactions = (params) => api.get('/transactions', { params })

// ── Accounts ─────────────────────────────────────────────────────────────────
export const listAccounts = (params) => api.get('/accounts', { params })
export const listUsers = () => api.get('/users')
export const getAccountBalance = (accountId) => api.get(`/accounts/${accountId}/balance`)
export const getAccountLedger = (accountId, params) => api.get(`/accounts/${accountId}/ledger`, { params })

// ── Fraud ────────────────────────────────────────────────────────────────────
export const getFraudReports = (params) => api.get('/fraud/reports', { params })

// ── Metrics ──────────────────────────────────────────────────────────────────
export const getMetrics = () => api.get('/metrics')

// ── Admin / Chaos ─────────────────────────────────────────────────────────────
export const getBankStatus = () => api.get('/admin/banks/status')
export const crashBankA = () => api.post('/admin/crash-bank-a')
export const crashBankB = () => api.post('/admin/crash-bank-b')
export const crashBankC = () => api.post('/admin/crash-bank-c')
export const recoverBank = (bankCode) => api.post(`/admin/recover/${bankCode}`)
export const addBankDelay = (bankCode, delayMs) => api.post('/admin/add-delay', { bankCode, delayMs })
export const setFailureRate = (bankCode, failureRate) => api.post('/admin/set-failure-rate', { bankCode, failureRate })
export const resetChaos = () => api.post('/admin/reset-chaos')

export default api
