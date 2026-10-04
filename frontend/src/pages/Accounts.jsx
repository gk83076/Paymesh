import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listAccounts, getAccountLedger } from '../lib/api'
import { formatCurrency, formatDate, shortId } from '../lib/constants'
import { PageHeader, Spinner, EmptyState } from '../components/ui'
import { Search, Building2, BookOpen, X, ArrowUpRight, ArrowDownLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'

function LedgerModal({ account, onClose }) {
  const { data, isLoading } = useQuery({
    queryKey: ['account-ledger', account?.id],
    queryFn: () => getAccountLedger(account.id),
    enabled: !!account,
    select: (d) => d.data,
  })

  const entries = data || []

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-surface-800 border border-surface-600 rounded-xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl">
        {/* Modal Header */}
        <div className="p-5 border-b border-surface-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400">
              <BookOpen size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-slate-100 text-base">Immutable Account Ledger</h3>
                <span className="badge-ghost text-xs font-mono">{account.accountNumber}</span>
              </div>
              <p className="text-xs text-slate-400">
                {account.user.name} ({account.user.upiId}) • {account.bank.name}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-surface-700 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Modal Balance Bar */}
        <div className="px-5 py-3 bg-surface-900/60 border-b border-surface-700 flex items-center justify-between text-xs">
          <span className="text-slate-400">Current Balance:</span>
          <span className="text-base font-bold text-emerald-400 font-mono">{formatCurrency(account.balance)}</span>
        </div>

        {/* Modal Body: Table */}
        <div className="p-5 overflow-y-auto flex-1">
          {isLoading ? (
            <div className="flex justify-center py-12"><Spinner size="md" /></div>
          ) : entries.length === 0 ? (
            <EmptyState
              title="No ledger entries found"
              description="This account has not had any debit or credit movements yet."
              icon={BookOpen}
            />
          ) : (
            <div className="table-container border border-surface-700">
              <table className="table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Balance Before</th>
                    <th>Balance After</th>
                    <th>Description</th>
                    <th>Date / Time</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => {
                    const isDebit = entry.type === 'DEBIT'
                    return (
                      <tr key={entry.id}>
                        <td>
                          <span className={clsx(
                            'badge text-xs inline-flex items-center gap-1 font-semibold',
                            isDebit ? 'badge-danger' : 'badge-success'
                          )}>
                            {isDebit ? <ArrowUpRight size={12} /> : <ArrowDownLeft size={12} />}
                            {entry.type}
                          </span>
                        </td>
                        <td>
                          <span className={clsx('font-bold font-mono text-xs', isDebit ? 'text-red-400' : 'text-emerald-400')}>
                            {isDebit ? '-' : '+'}{formatCurrency(entry.amount)}
                          </span>
                        </td>
                        <td>
                          <span className="font-mono text-xs text-slate-400">{formatCurrency(entry.balanceBefore)}</span>
                        </td>
                        <td>
                          <span className="font-mono text-xs text-slate-200 font-semibold">{formatCurrency(entry.balanceAfter)}</span>
                        </td>
                        <td>
                          <span className="text-xs text-slate-400 max-w-44 truncate block" title={entry.description || ''}>
                            {entry.description || 'Transfer'}
                          </span>
                        </td>
                        <td>
                          <span className="text-xs font-mono text-slate-500">
                            {formatDate(entry.createdAt)}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-surface-700 bg-surface-900/40 flex items-center justify-between text-xs text-slate-500">
          <span>Double-entry immutable bookkeeping ledger</span>
          <button onClick={onClose} className="btn-secondary text-xs py-1.5 px-4">Close</button>
        </div>
      </div>
    </div>
  )
}

export default function Accounts() {
  const [search, setSearch] = useState('')
  const [bank, setBank] = useState('')
  const [page, setPage] = useState(1)
  const [selectedAccountForLedger, setSelectedAccountForLedger] = useState(null)
  const navigate = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['accounts', search, bank, page],
    queryFn: () => listAccounts({ search, bank, page, limit: 20 }),
    select: (d) => d.data,
  })

  const accounts = data?.accounts || []
  const total = data?.total || 0
  const totalPages = data?.totalPages || 1

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Accounts"
        subtitle={`${total} accounts across 3 virtual banks`}
      />

      {/* Filters */}
      <div className="card flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search name, UPI ID, account..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="input pl-8"
          />
        </div>
        <select value={bank} onChange={(e) => { setBank(e.target.value); setPage(1) }} className="select w-40">
          <option value="">All Banks</option>
          <option value="BANK_A">Axis Virtual</option>
          <option value="BANK_B">HDFC Sim</option>
          <option value="BANK_C">SBI Sim</option>
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : accounts.length === 0 ? (
        <EmptyState title="No accounts found" description="Try adjusting your search" icon={Building2} />
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>UPI ID</th>
                <th>Bank</th>
                <th>Account No.</th>
                <th>Balance</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((acc) => (
                <tr key={acc.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-500 to-violet-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {acc.user.name[0]}
                      </div>
                      <div>
                        <p className="text-slate-200 font-medium text-sm">{acc.user.name}</p>
                        <p className="text-slate-500 text-xs">{acc.user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="font-mono text-xs text-sky-400">{acc.user.upiId}</span>
                  </td>
                  <td>
                    <div className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${acc.bank.isCrashed ? 'bg-red-400' : 'bg-emerald-400'}`} />
                      <span className="text-sm">{acc.bank.name}</span>
                    </div>
                  </td>
                  <td>
                    <span className="font-mono text-xs text-slate-400">{acc.accountNumber}</span>
                  </td>
                  <td>
                    <span className="font-semibold text-emerald-400 font-mono">{formatCurrency(acc.balance)}</span>
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <button
                        className="btn-secondary text-xs py-1.5 px-2.5 inline-flex items-center gap-1"
                        onClick={() => setSelectedAccountForLedger(acc)}
                        title="View Immutable Ledger"
                      >
                        <BookOpen size={13} />
                        Ledger
                      </button>
                      <button
                        className="btn-primary text-xs py-1.5 px-3"
                        onClick={() => navigate('/transfer', { state: { senderId: acc.user.id } })}
                      >
                        Transfer
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
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

      {/* Ledger Modal */}
      {selectedAccountForLedger && (
        <LedgerModal
          account={selectedAccountForLedger}
          onClose={() => setSelectedAccountForLedger(null)}
        />
      )}
    </div>
  )
}
