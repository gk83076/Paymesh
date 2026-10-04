import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listTransactions, getTransfer, rollbackTransfer } from '../lib/api'
import { STATUS_CONFIG, RISK_CONFIG, formatCurrency, formatDate, shortId } from '../lib/constants'
import { PageHeader, Spinner, EmptyState, RiskBadge } from '../components/ui'
import { List, X, RefreshCw, AlertTriangle, ArrowRight, CheckCircle2, RotateCcw } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import clsx from 'clsx'

function TransactionDetailModal({ txnId, onClose }) {
  const qc = useQueryClient()
  const addToast = useAppStore((s) => s.addToast)

  const { data, isLoading } = useQuery({
    queryKey: ['transaction-detail', txnId],
    queryFn: () => getTransfer(txnId),
    enabled: !!txnId,
    select: (d) => d.data,
  })

  const rollbackMutation = useMutation({
    mutationFn: () => rollbackTransfer(txnId),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['transaction-detail', txnId] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
      addToast({ type: 'success', title: 'Rollback Completed', message: 'Funds refunded to sender' })
    },
    onError: (err) => {
      addToast({ type: 'error', title: 'Rollback Failed', message: err.message })
    },
  })

  const txn = data

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-surface-800 border border-surface-600 rounded-xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="p-5 border-b border-surface-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 font-bold font-mono">
              TX
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-slate-100 text-base">Transaction Explorer</h3>
                <span className="font-mono text-xs text-sky-400 font-semibold">{txnId}</span>
              </div>
              <p className="text-xs text-slate-400">Detailed distributed switch lifecycle and audit logs</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-surface-700 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex-1 space-y-5">
          {isLoading || !txn ? (
            <div className="flex justify-center py-16"><Spinner size="lg" /></div>
          ) : (
            <>
              {/* Summary Bar */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="card p-3 bg-surface-900/60">
                  <span className="text-slate-500 text-xs">Amount</span>
                  <p className="text-lg font-bold text-slate-100 font-mono">{formatCurrency(txn.amount)}</p>
                </div>
                <div className="card p-3 bg-surface-900/60">
                  <span className="text-slate-500 text-xs">Status</span>
                  <div className="mt-1">
                    <span className={clsx('badge text-xs', STATUS_CONFIG[txn.status]?.color)}>
                      {STATUS_CONFIG[txn.status]?.label || txn.status}
                    </span>
                  </div>
                </div>
                <div className="card p-3 bg-surface-900/60">
                  <span className="text-slate-500 text-xs">Risk Level</span>
                  <div className="mt-1">
                    <RiskBadge riskLevel={txn.riskLevel} />
                  </div>
                </div>
                <div className="card p-3 bg-surface-900/60">
                  <span className="text-slate-500 text-xs">Fraud Score</span>
                  <p className={clsx('text-lg font-bold font-mono', txn.fraudScore >= 40 ? 'text-amber-400' : 'text-slate-200')}>
                    {txn.fraudScore}/100
                  </p>
                </div>
              </div>

              {/* Sender & Receiver Info */}
              <div className="rounded-lg bg-surface-900 border border-surface-700 p-4 flex items-center justify-between text-xs">
                <div>
                  <span className="text-slate-500">Sender:</span>
                  <p className="font-semibold text-slate-200 text-sm">{txn.sender?.name}</p>
                  <p className="font-mono text-sky-400">{txn.sender?.upiId}</p>
                  <p className="text-slate-500 mt-0.5">{txn.senderAccount?.bank?.name}</p>
                </div>
                <div className="flex flex-col items-center px-4">
                  <ArrowRight size={20} className="text-brand-400" />
                  <span className="text-[10px] text-slate-500 font-mono mt-1">UPI Switch</span>
                </div>
                <div className="text-right">
                  <span className="text-slate-500">Receiver:</span>
                  <p className="font-semibold text-slate-200 text-sm">{txn.receiver?.name}</p>
                  <p className="font-mono text-sky-400">{txn.receiver?.upiId}</p>
                  <p className="text-slate-500 mt-0.5">{txn.receiverAccount?.bank?.name}</p>
                </div>
              </div>

              {/* Rollback Action Bar (if stuck in recovery) */}
              {txn.status === 'RECOVERY_PENDING' && (
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-4 flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-amber-300 text-sm flex items-center gap-1.5">
                      <AlertTriangle size={15} />
                      Recovery In Progress
                    </h4>
                    <p className="text-xs text-amber-400/80 mt-0.5">
                      Credit failed. Background retry jobs active. You can trigger an immediate manual compensation rollback.
                    </p>
                  </div>
                  <button
                    className="btn-danger text-xs py-1.5 px-3 shrink-0 flex items-center gap-1"
                    onClick={() => rollbackMutation.mutate()}
                    disabled={rollbackMutation.isPending}
                  >
                    <RotateCcw size={13} className={rollbackMutation.isPending ? 'animate-spin' : ''} />
                    Trigger Rollback
                  </button>
                </div>
              )}

              {/* State Machine Transition Timeline */}
              <div className="card space-y-3">
                <h4 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-brand-400" />
                  State Machine Audit Trail
                </h4>
                <div className="space-y-2 relative border-l-2 border-surface-700 ml-3 pl-4">
                  {(txn.stateHistory || []).map((step, idx) => (
                    <div key={idx} className="relative">
                      <div className="absolute -left-[23px] top-1 w-3 h-3 rounded-full bg-brand-500 border-2 border-surface-800" />
                      <div className="flex items-center gap-2 text-xs">
                        <span className={clsx('badge text-[11px]', STATUS_CONFIG[step.toState]?.color || 'badge-ghost')}>
                          {step.toState}
                        </span>
                        <span className="font-mono text-slate-500 text-[11px]">{formatDate(step.createdAt)}</span>
                      </div>
                      {step.reason && (
                        <p className="text-xs text-slate-400 mt-0.5">{step.reason}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Ledger Entries for this Transaction */}
              {txn.ledgerEntries && txn.ledgerEntries.length > 0 && (
                <div className="card space-y-3">
                  <h4 className="text-sm font-semibold text-slate-200">Double-Entry Ledger Records</h4>
                  <div className="table-container border border-surface-700">
                    <table className="table text-xs">
                      <thead>
                        <tr>
                          <th>Type</th>
                          <th>Amount</th>
                          <th>Balance Before</th>
                          <th>Balance After</th>
                          <th>Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {txn.ledgerEntries.map((l) => (
                          <tr key={l.id}>
                            <td>
                              <span className={clsx('badge text-xs', l.type === 'DEBIT' ? 'badge-danger' : 'badge-success')}>
                                {l.type}
                              </span>
                            </td>
                            <td className="font-mono font-semibold">
                              {l.type === 'DEBIT' ? '-' : '+'}{formatCurrency(l.amount)}
                            </td>
                            <td className="font-mono text-slate-400">{formatCurrency(l.balanceBefore)}</td>
                            <td className="font-mono text-slate-200">{formatCurrency(l.balanceAfter)}</td>
                            <td className="text-slate-400 truncate max-w-40">{l.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-surface-700 bg-surface-900/40 flex items-center justify-between text-xs text-slate-500">
          <span>Idempotency Key: {txn?.idempotencyKey || 'N/A'}</span>
          <button onClick={onClose} className="btn-secondary text-xs py-1.5 px-4">Close</button>
        </div>
      </div>
    </div>
  )
}

export default function Transactions() {
  const [filters, setFilters] = useState({ status: '', riskLevel: '', dateFrom: '', dateTo: '' })
  const [page, setPage] = useState(1)
  const [selectedTxnId, setSelectedTxnId] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['transactions', filters, page],
    queryFn: () => listTransactions({ ...filters, page, limit: 20 }),
    select: (d) => d.data,
  })

  const transactions = data?.transactions || []
  const total = data?.total || 0
  const totalPages = data?.totalPages || 1

  const updateFilter = (key, val) => { setFilters((f) => ({ ...f, [key]: val })); setPage(1) }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Transactions" subtitle={`${total} total transactions with live state audits`} />

      {/* Filters */}
      <div className="card flex flex-wrap gap-3 items-end">
        <div>
          <label className="label">Status</label>
          <select className="select w-44" value={filters.status} onChange={(e) => updateFilter('status', e.target.value)}>
            <option value="">All Statuses</option>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Risk Level</label>
          <select className="select w-40" value={filters.riskLevel} onChange={(e) => updateFilter('riskLevel', e.target.value)}>
            <option value="">All Risks</option>
            {Object.entries(RISK_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">From</label>
          <input type="date" className="input w-40" value={filters.dateFrom} onChange={(e) => updateFilter('dateFrom', e.target.value)} />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" className="input w-40" value={filters.dateTo} onChange={(e) => updateFilter('dateTo', e.target.value)} />
        </div>
        <button className="btn-ghost text-xs" onClick={() => { setFilters({ status: '', riskLevel: '', dateFrom: '', dateTo: '' }); setPage(1) }}>
          Clear
        </button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : transactions.length === 0 ? (
        <EmptyState title="No transactions found" description="Try adjusting filters or run a transfer" icon={List} />
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Transaction ID</th>
                <th>Sender</th>
                <th>Receiver</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Fraud Score</th>
                <th>Created At</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => {
                const cfg = STATUS_CONFIG[t.status] || {}
                return (
                  <tr key={t.id} className="hover:bg-surface-700/50 transition-colors">
                    <td>
                      <span className="font-mono text-xs text-sky-400 font-semibold">{shortId(t.id)}</span>
                    </td>
                    <td>
                      <div>
                        <p className="text-slate-200 text-sm font-medium">{t.sender?.name}</p>
                        <p className="text-slate-500 text-xs font-mono">{t.sender?.upiId}</p>
                      </div>
                    </td>
                    <td>
                      <div>
                        <p className="text-slate-200 text-sm font-medium">{t.receiver?.name}</p>
                        <p className="text-slate-500 text-xs font-mono">{t.receiver?.upiId}</p>
                      </div>
                    </td>
                    <td>
                      <span className="font-bold text-slate-100 font-mono">{formatCurrency(t.amount)}</span>
                    </td>
                    <td>
                      <span className={clsx('badge text-xs', cfg.color)}>
                        {cfg.label || t.status}
                      </span>
                    </td>
                    <td>
                      <span className={clsx('font-mono text-xs font-bold', t.fraudScore >= 40 ? 'text-amber-400' : 'text-slate-400')}>
                        {t.fraudScore}
                      </span>
                    </td>
                    <td>
                      <span className="font-mono text-xs text-slate-500">{formatDate(t.createdAt)}</span>
                    </td>
                    <td>
                      <button
                        className="btn-secondary text-xs py-1 px-2.5"
                        onClick={() => setSelectedTxnId(t.id)}
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-400">Page {page} of {totalPages}</p>
          <div className="flex gap-2">
            <button className="btn-secondary text-xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
            <button className="btn-secondary text-xs" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedTxnId && (
        <TransactionDetailModal
          txnId={selectedTxnId}
          onClose={() => setSelectedTxnId(null)}
        />
      )}
    </div>
  )
}
