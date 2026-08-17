import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listUsers, initiateTransfer, getTransfer } from '../lib/api'
import { useAppStore } from '../store/useAppStore'
import { STATUS_CONFIG, formatCurrency } from '../lib/constants'
import { PageHeader, Spinner } from '../components/ui'
import { ArrowRight, CheckCircle2, XCircle, RefreshCw, AlertTriangle } from 'lucide-react'
// Use browser crypto for UUID generation (no extra dep needed)
const uuidv4 = () => crypto.randomUUID()
import clsx from 'clsx'

// ── State Flow Visualizer ────────────────────────────────────────────────────
const STATE_FLOW = [
  'INITIATED',
  'DEBIT_PENDING',
  'DEBIT_SUCCESS',
  'CREDIT_PENDING',
  'CREDIT_SUCCESS',
  'SUCCESS',
]

const ERROR_STATES = ['FAILED', 'ROLLBACK_INITIATED', 'ROLLED_BACK', 'RECOVERY_PENDING']

function StateNode({ state, currentState, timestamp }) {
  const cfg = STATUS_CONFIG[state] || {}
  const isActive = currentState === state
  const isPast = isPastState(STATE_FLOW, currentState, state)
  const isError = ERROR_STATES.includes(currentState)

  const baseStyle = 'flex flex-col items-center gap-1.5'
  const circleStyle = clsx(
    'w-10 h-10 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all duration-500',
    isActive && !isError && 'border-sky-400 bg-sky-400/10 text-sky-400 state-active shadow-[0_0_12px_rgba(56,189,248,0.4)]',
    isActive && isError && 'border-red-400 bg-red-400/10 text-red-400',
    isPast && !isError && 'border-emerald-500 bg-emerald-500/10 text-emerald-400',
    !isActive && !isPast && 'border-surface-600 bg-surface-800 text-slate-600',
  )

  return (
    <div className={baseStyle}>
      <div className={circleStyle}>
        {isPast ? <CheckCircle2 size={16} /> : isActive ? '●' : '○'}
      </div>
      <span className={clsx('text-[10px] font-medium text-center max-w-16 leading-tight', {
        'text-sky-400': isActive && !isError,
        'text-red-400': isActive && isError,
        'text-emerald-400': isPast,
        'text-slate-600': !isActive && !isPast,
      })}>
        {cfg.label || state.replace(/_/g, ' ')}
      </span>
      {timestamp && (
        <span className="text-[9px] text-slate-600 font-mono">
          {new Date(timestamp).toLocaleTimeString('en-IN')}
        </span>
      )}
    </div>
  )
}

function isPastState(flow, current, state) {
  const ci = flow.indexOf(current)
  const si = flow.indexOf(state)
  return ci > si && si !== -1
}

function Connector({ passed }) {
  return (
    <div className={clsx('flex-1 h-0.5 transition-all duration-500 mt-5', {
      'bg-emerald-500': passed,
      'bg-surface-700': !passed,
    })} />
  )
}

function TransferFlowVisualizer({ transaction }) {
  if (!transaction) return null

  const currentState = transaction.status
  const stateHistory = transaction.stateHistory || []
  const timestampMap = Object.fromEntries(
    stateHistory.map((h) => [h.toState, h.createdAt])
  )

  const isTerminalError = ERROR_STATES.includes(currentState)

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-300">Live Transfer Flow</h3>
        <div className={clsx('badge text-xs', STATUS_CONFIG[currentState]?.color)}>
          {STATUS_CONFIG[currentState]?.label || currentState}
        </div>
      </div>

      {/* State flow */}
      <div className="flex items-start gap-1 overflow-x-auto pb-2">
        {STATE_FLOW.map((state, i) => (
          <div key={state} className="flex items-start gap-1 shrink-0">
            <StateNode
              state={state}
              currentState={currentState}
              timestamp={timestampMap[state]}
            />
            {i < STATE_FLOW.length - 1 && (
              <Connector passed={isPastState(STATE_FLOW, currentState, STATE_FLOW[i + 1])} />
            )}
          </div>
        ))}
      </div>

      {/* Error state */}
      {isTerminalError && (
        <div className="rounded-lg bg-red-500/5 border border-red-500/20 p-3">
          <p className="text-red-400 text-xs font-medium flex items-center gap-1.5">
            <XCircle size={12} />
            {currentState === 'ROLLED_BACK' ? 'Transfer rolled back — amount refunded to sender' :
             currentState === 'RECOVERY_PENDING' ? 'Retry in progress — waiting for credit to succeed' :
             'Transfer failed'}
          </p>
        </div>
      )}

      {/* State history */}
      <div>
        <p className="text-xs text-slate-500 mb-2 font-medium">State History</p>
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {stateHistory.map((h, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <span className="text-slate-600 font-mono shrink-0 mt-0.5">
                {new Date(h.createdAt).toLocaleTimeString('en-IN')}
              </span>
              <span className={clsx('shrink-0', STATUS_CONFIG[h.toState]?.color || 'badge-ghost')}>
                {h.toState}
              </span>
              {h.reason && <span className="text-slate-500 truncate">{h.reason}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Fraud score */}
      {transaction.fraudScore > 0 && (
        <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-3">
          <p className="text-amber-400 text-xs flex items-center gap-1.5">
            <AlertTriangle size={12} />
            Fraud Score: <strong>{transaction.fraudScore}</strong> — Risk: <strong>{transaction.riskLevel}</strong>
          </p>
        </div>
      )}
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function TransferSimulator() {
  const [form, setForm] = useState({ senderId: '', receiverId: '', amount: '' })
  const [txnId, setTxnId] = useState(null)
  const addToast = useAppStore((s) => s.addToast)

  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: listUsers,
    select: (d) => d.data,
  })

  const { data: txnData, refetch: refetchTxn } = useQuery({
    queryKey: ['transaction', txnId],
    queryFn: () => getTransfer(txnId),
    enabled: !!txnId,
    refetchInterval: (data) => {
      const status = data?.data?.status
      if (!status) return 1000
      const terminal = ['SUCCESS', 'FAILED', 'ROLLED_BACK']
      return terminal.includes(status) ? false : 1500
    },
    select: (d) => d.data,
  })

  const mutation = useMutation({
    mutationFn: (payload) => initiateTransfer(payload),
    onSuccess: (res) => {
      const txn = res.data
      setTxnId(txn.transactionId)
      if (txn.status === 'SUCCESS') {
        addToast({ type: 'success', title: 'Transfer Successful', message: `₹${form.amount} sent successfully` })
      } else if (txn._idempotencyHit) {
        addToast({ type: 'info', title: 'Duplicate Request', message: 'Idempotency hit — returning cached result' })
      } else {
        addToast({ type: 'warning', title: 'Transfer Queued', message: `Status: ${txn.status}` })
      }
    },
    onError: (err) => {
      addToast({ type: 'error', title: 'Transfer Failed', message: err.message })
    },
  })

  const users = usersData || []
  const senderOptions = users.filter((u) => u.id !== form.receiverId)
  const receiverOptions = users.filter((u) => u.id !== form.senderId)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.senderId || !form.receiverId || !form.amount) {
      addToast({ type: 'warning', title: 'Validation', message: 'Please fill all fields' })
      return
    }
    setTxnId(null)
    mutation.mutate({
      senderId: form.senderId,
      receiverId: form.receiverId,
      amount: parseFloat(form.amount),
      idempotencyKey: uuidv4(),
    })
  }

  const senderUser = users.find((u) => u.id === form.senderId)
  const receiverUser = users.find((u) => u.id === form.receiverId)

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Transfer Simulator"
        subtitle="Simulate a UPI transfer and watch the state machine in real-time"
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Form */}
        <div className="card space-y-5">
          <h2 className="text-sm font-semibold text-slate-300">Initiate Transfer</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Sender</label>
              <select className="select" value={form.senderId} onChange={(e) => setForm({ ...form, senderId: e.target.value })}>
                <option value="">Select sender...</option>
                {senderOptions.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} — {u.upiId} (₹{u.accounts?.[0]?.balance?.toLocaleString('en-IN')})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Receiver</label>
              <select className="select" value={form.receiverId} onChange={(e) => setForm({ ...form, receiverId: e.target.value })}>
                <option value="">Select receiver...</option>
                {receiverOptions.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} — {u.upiId}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Amount (₹)</label>
              <input
                type="number"
                className="input"
                placeholder="Enter amount..."
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                min="1"
                max="1000000"
              />
              <div className="flex gap-2 mt-2">
                {[1000, 5000, 10000, 50000, 100000].map((a) => (
                  <button key={a} type="button" className="btn-ghost text-xs py-1 px-2 border border-surface-600"
                    onClick={() => setForm({ ...form, amount: a })}>
                    ₹{a.toLocaleString('en-IN')}
                  </button>
                ))}
              </div>
            </div>

            {/* Preview */}
            {senderUser && receiverUser && form.amount && (
              <div className="rounded-lg bg-surface-900 border border-surface-700 p-3 flex items-center gap-3 text-sm">
                <div className="text-right flex-1">
                  <p className="text-slate-200 font-medium">{senderUser.name}</p>
                  <p className="text-slate-500 text-xs">{senderUser.upiId}</p>
                </div>
                <div className="flex flex-col items-center">
                  <ArrowRight size={16} className="text-brand-400" />
                  <span className="text-brand-400 font-bold text-xs">{formatCurrency(parseFloat(form.amount) || 0)}</span>
                </div>
                <div className="flex-1">
                  <p className="text-slate-200 font-medium">{receiverUser.name}</p>
                  <p className="text-slate-500 text-xs">{receiverUser.upiId}</p>
                </div>
              </div>
            )}

            <button type="submit" className="btn-primary w-full" disabled={mutation.isPending}>
              {mutation.isPending ? <><Spinner size="sm" /> Processing...</> : <><ArrowRight size={14} /> Send Transfer</>}
            </button>
          </form>
        </div>

        {/* Flow Visualizer */}
        <div>
          {txnData ? (
            <TransferFlowVisualizer transaction={txnData} />
          ) : (
            <div className="card h-full flex flex-col items-center justify-center text-center py-16">
              <div className="w-12 h-12 rounded-full bg-brand-500/10 flex items-center justify-center mb-4">
                <ArrowRight size={20} className="text-brand-400" />
              </div>
              <p className="text-slate-300 font-medium">Transfer Flow</p>
              <p className="text-slate-500 text-sm mt-1">Initiate a transfer to see the state machine visualization</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
