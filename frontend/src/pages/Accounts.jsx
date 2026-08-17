import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listAccounts } from '../lib/api'
import { formatCurrency, BANK_NAMES } from '../lib/constants'
import { PageHeader, Spinner, EmptyState } from '../components/ui'
import { Search, Building2, Wallet } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function Accounts() {
  const [search, setSearch] = useState('')
  const [bank, setBank] = useState('')
  const [page, setPage] = useState(1)
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
                <th>Action</th>
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
                    <span className="font-semibold text-emerald-400">{formatCurrency(acc.balance)}</span>
                  </td>
                  <td>
                    <button
                      className="btn-primary text-xs py-1.5 px-3"
                      onClick={() => navigate('/transfer', { state: { senderId: acc.user.id } })}
                    >
                      Transfer
                    </button>
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
    </div>
  )
}
