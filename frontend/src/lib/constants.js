// Transaction status colors and labels
export const STATUS_CONFIG = {
  INITIATED:         { label: 'Initiated',       color: 'badge-ghost',   dot: 'bg-slate-400' },
  DEBIT_PENDING:     { label: 'Debit Pending',   color: 'badge-warning', dot: 'bg-amber-400' },
  DEBIT_SUCCESS:     { label: 'Debit Done',      color: 'badge-info',    dot: 'bg-sky-400'   },
  CREDIT_PENDING:    { label: 'Credit Pending',  color: 'badge-warning', dot: 'bg-amber-400' },
  CREDIT_SUCCESS:    { label: 'Credit Done',     color: 'badge-info',    dot: 'bg-sky-400'   },
  SUCCESS:           { label: 'Success',         color: 'badge-success', dot: 'bg-emerald-400' },
  FAILED:            { label: 'Failed',          color: 'badge-danger',  dot: 'bg-red-400'   },
  ROLLBACK_INITIATED:{ label: 'Rolling Back',    color: 'badge-danger',  dot: 'bg-red-400'   },
  ROLLED_BACK:       { label: 'Rolled Back',     color: 'badge-purple',  dot: 'bg-purple-400' },
  RECOVERY_PENDING:  { label: 'Recovery',        color: 'badge-warning', dot: 'bg-amber-400' },
}

export const RISK_CONFIG = {
  NORMAL:     { label: 'Normal',    color: 'badge-success' },
  SUSPICIOUS: { label: 'Suspicious',color: 'badge-warning' },
  HIGH_RISK:  { label: 'High Risk', color: 'badge-danger'  },
}

export const BANK_NAMES = {
  BANK_A: 'Axis Virtual',
  BANK_B: 'HDFC Sim',
  BANK_C: 'SBI Sim',
}

export function formatCurrency(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatDate(dateStr) {
  return new Date(dateStr).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function shortId(id) {
  return id?.slice(0, 8) + '...'
}
