import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getFraudReports } from '../lib/api'
import { RISK_CONFIG, formatCurrency, formatDate, shortId } from '../lib/constants'
import { PageHeader, Spinner, EmptyState, FraudScore, RiskBadge } from '../components/ui'
import { ShieldAlert } from 'lucide-react'

export default function FraudCenter() {
  const [riskLevel, setRiskLevel] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['fraud-reports', riskLevel, page],
    queryFn: () => getFraudReports({ riskLevel, page, limit: 20 }),
    refetchInterval: 10000,
    select: (d) => d.data,
  })

  const reports = data?.reports || []
  const total = data?.total || 0

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Fraud Center"
        subtitle="Rule-based fraud detection reports"
        actions={
          <div className="flex items-center gap-2">
            <span className="badge-danger">{total} flagged</span>
          </div>
        }
      />

      {/* Filters */}
      <div className="card flex gap-3">
        <select className="select w-44" value={riskLevel} onChange={(e) => { setRiskLevel(e.target.value); setPage(1) }}>
          <option value="">All Risk Levels</option>
          {Object.entries(RISK_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : reports.length === 0 ? (
        <EmptyState
          title="No fraud reports"
          description="No transactions have been flagged yet"
          icon={ShieldAlert}
        />
      ) : (
        <div className="space-y-4">
          {reports.map((report) => (
            <div key={report.id} className={`card hover:border-surface-600 transition-colors ${report.riskLevel === 'HIGH_RISK' ? 'border-red-500/30' : report.riskLevel === 'SUSPICIOUS' ? 'border-amber-500/30' : ''}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <RiskBadge riskLevel={report.riskLevel} />
                    <span className="text-xs text-slate-500 font-mono">Txn: {shortId(report.transactionId)}</span>
                  </div>
                  <p className="text-slate-200 font-medium">{report.user?.name}</p>
                  <p className="text-slate-500 text-xs font-mono">{report.user?.upiId}</p>
                </div>
                <div className="text-right">
                  <FraudScore score={report.fraudScore} />
                  <p className="text-xs text-slate-500 mt-1">{formatDate(report.createdAt)}</p>
                </div>
              </div>

              {/* Transaction details */}
              {report.transaction && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3 text-xs">
                  <div>
                    <span className="text-slate-500">Amount</span>
                    <p className="font-semibold text-slate-200">{formatCurrency(report.transaction.amount)}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Sender</span>
                    <p className="text-slate-200">{report.transaction.sender?.name}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Receiver</span>
                    <p className="text-slate-200">{report.transaction.receiver?.name}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Status</span>
                    <p className="text-slate-200">{report.transaction.status}</p>
                  </div>
                </div>
              )}

              {/* Triggered rules */}
              <div>
                <p className="text-xs text-slate-500 mb-2 font-medium">Triggered Rules</p>
                <div className="space-y-1.5">
                  {(Array.isArray(report.rules) ? report.rules : []).map((rule, i) => (
                    <div key={i} className="flex items-start gap-2 bg-surface-900 rounded-lg px-3 py-2">
                      <span className="badge-danger text-xs shrink-0">{rule.rule}</span>
                      <span className="text-xs text-slate-400">{rule.detail}</span>
                      <span className="ml-auto text-xs text-slate-500 shrink-0">+{rule.weight}pts</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {data?.total > 20 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-400">Page {page}</p>
          <div className="flex gap-2">
            <button className="btn-secondary text-xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
            <button className="btn-secondary text-xs" disabled={reports.length < 20} onClick={() => setPage(p => p + 1)}>Next</button>
          </div>
        </div>
      )}
    </div>
  )
}
