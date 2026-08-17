import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listTransactions } from '../lib/api'
import { STATUS_CONFIG, RISK_CONFIG, formatCurrency, formatDate, shortId } from '../lib/constants'
import { PageHeader, Spinner, EmptyState, FraudScore } from '../components/ui'
import { useNavigate } from 'react-router-dom'
import { List, Filter } from 'lucide-react'
import clsx from 'clsx'

export default function Transactions() {
  const [filters, setFilters] = useState({ status: '', riskLevel: '', dateFrom: '', dateTo: '' })
  const [page, setPage] = useState(1)
  const navigate = useNavigate()

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
      <PageHeader title="Transactions" subtitle={`${total} total transactions`} />

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
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => {
                const cfg = STATUS_CONFIG[t.status] || {}
                return (
                  <tr key={t.id} className="cursor-pointer" onClick={() => navigate(`/transactions/${t.id}`)}>
                    <td>
                      <span className="font-mono text-xs text-sky-400">{shortId(t.id)}</span>
                    </td>
                    <td>
                      <div>
                        <p className="text-slate-200 text-sm">{t.sender?.name}</p>
                        <p className="text-slate-500 text-xs font-mono">{t.sender?.upiId}</p>
                      </div>
                    </td>
                    <td>
                      <div>
                        <p className="text-slate-200 text-sm">{t.receiver?.name}</p>
                        <p className="text-slate-500 text-xs font-mono">{t.receiver?.upiId}</p>
                      </div>
                    </td>
                    <td>
                      <span className="font-semibold text-slate-200">{formatCurrency(t.amount)}</span>
                    </td>
                    <td>
                      <span className={cfg.color}>{cfg.label}</span>
                    </td>
                    <td>
                      <FraudScore score={t.fraudScore} />
                    </td>
                    <td>
                      <span className="text-slate-400 text-xs">{formatDate(t.createdAt)}</span>
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
          <p className="text-sm text-slate-400">Page {page} of {totalPages} · {total} records</p>
          <div className="flex gap-2">
            <button className="btn-secondary text-xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
            <button className="btn-secondary text-xs" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
          </div>
        </div>
      )}
    </div>
  )
}
