import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listUsers, initiateTransfer, getTransfer, rollbackTransfer } from '../lib/api'
import { useAppStore } from '../store/useAppStore'
import { STATUS_CONFIG, formatCurrency, formatDate } from '../lib/constants'
import { PageHeader, Spinner } from '../components/ui'
import {
  ArrowRight, CheckCircle2, XCircle, RefreshCw, AlertTriangle, Key,
  Copy, RotateCcw, ShieldCheck, Zap
} from 'lucide-react'
import clsx from 'clsx'

const uuidv4 = () => crypto.randomUUID()

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

function isPastState(flow, current, state) {
  const ci = flow.indexOf(current)
  const si = flow.indexOf(state)
  return ci > si && si !== -1
}

function StateNode({ state, currentState, timestamp }) {
  const cfg = STATUS_CONFIG[state] || {}
  const isActive = currentState === state
  const isPast = isPastState(STATE_FLOW, currentState, state)
  const isError = ERROR_STATES.includes(currentState)

  const circleStyle = clsx(
    'w-10 h-10 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all duration-500',
    isActive && !isError && 'border-sky-400 bg-sky-400/10 text-sky-400 state-active shadow-[0_0_12px_rgba(56,189,248,0.4)]',
    isActive && isError && 'border-red-400 bg-red-400/10 text-red-400',
    isPast && !isError && 'border-emerald-500 bg-emerald-500/10 text-emerald-400',
    !isActive && !isPast && 'border-surface-600 bg-surface-800 text-slate-600',
  )

  return (
    <div className="flex flex-col items-center gap-1.5">
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
        <span className="text-[9px] text-slate-500 font-mono">
          {new Date(timestamp).toLocaleTimeString('en-IN')}
        </span>
      )}
    </div>
  )
}

function Connector({ passed }) {
  return (
    <div className={clsx('flex-1 h-0.5 transition-all duration-500 mt-5', {
      'bg-emerald-500': passed,
      'bg-surface-700': !passed,
    })} />
  )
}

function TransferFlowVisualizer({ transaction, onRollback, isRollingBack, isIdempotencyHit }) {
  if (!transaction) return null

  const currentState = transaction.status
  const stateHistory = transaction.stateHistory || []
  const timestampMap = Object.fromEntries(
    stateHistory.map((h) => [h.toState, h.createdAt])
  )

  const isRecovery = currentState === 'RECOVERY_PENDING'
  const isRolledBack = currentState === 'ROLLED_BACK'
  const isFailed = currentState === 'FAILED'

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-300">Live Transfer Flow</h3>
        <div className={clsx('badge text-xs', STATUS_CONFIG[currentState]?.color)}>
          {STATUS_CONFIG[currentState]?.label || currentState}
        </div>
      </div>

      {/* Idempotency Hit Banner */}
      {isIdempotencyHit && (
        <div className="rounded-lg bg-sky-500/10 border border-sky-500/30 p-3.5 flex items-start gap-2.5 animate-fade-in">
          <ShieldCheck size={18} className="text-sky-400 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-semibold text-sky-300">⚡ Distributed Idempotency Hit</p>
            <p className="text-sky-400/80 mt-0.5">
              Duplicate request intercepted. The switch returned the cached response snapshot without executing a double debit.
            </p>
          </div>
        </div>
      )}

      {/* State Flow Nodes */}
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

      {/* Recovery Pending / Compensation Action */}
      {isRecovery && (
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3.5 flex items-center justify-between">
          <div>
            <p className="text-amber-300 text-xs font-semibold flex items-center gap-1.5">
              <AlertTriangle size={14} />
              Credit Failed — Retry In Progress
            </p>
            <p className="text-amber-400/70 text-[11px] mt-0.5">
              Sender was debited, but receiver bank credit encountered an outage.
            </p>
          </div>
          <button
            className="btn-danger text-xs py-1.5 px-3 flex items-center gap-1 shrink-0"
            onClick={onRollback}
            disabled={isRollingBack}
          >
            <RotateCcw size={13} className={isRollingBack ? 'animate-spin' : ''} />
            Trigger Rollback
          </button>
        </div>
      )}

      {/* Rolled Back Alert */}
      {isRolledBack && (
        <div className="rounded-lg bg-purple-500/10 border border-purple-500/30 p-3">
          <p className="text-purple-300 text-xs font-semibold flex items-center gap-1.5">
            <CheckCircle2 size={14} className="text-purple-400" />
            Compensating Rollback Completed
          </p>
          <p className="text-purple-400/80 text-[11px] mt-0.5">
            Sender account has been credited back. Ledger recorded an immutable refund entry.
          </p>
        </div>
      )}

      {/* Failed Alert */}
      {isFailed && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3">
          <p className="text-red-400 text-xs font-medium flex items-center gap-1.5">
            <XCircle size={14} />
            Transfer Failed
          </p>
        </div>
      )}

      {/* Fraud Alert */}
      {transaction.fraudScore > 0 && (
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 flex items-center justify-between">
          <p className="text-amber-300 text-xs flex items-center gap-1.5 font-medium">
            <AlertTriangle size={14} className="text-amber-400" />
            Fraud Risk: <strong>{transaction.riskLevel}</strong> (Score: {transaction.fraudScore}/100)
          </p>
          <span className="badge-warning text-[10px]">Rule Triggered</span>
        </div>
      )}

      {/* State History Log */}
      <div>
        <p className="text-xs text-slate-500 mb-2 font-medium">State Machine Transition Audit</p>
        <div className="space-y-1.5 max-h-40 overflow-y-auto">
          {stateHistory.map((h, i) => (
            <div key={i} className="flex items-start gap-2 text-xs bg-surface-900/60 p-2 rounded-lg">
              <span className="text-slate-500 font-mono text-[10px] shrink-0 mt-0.5">
                {new Date(h.createdAt).toLocaleTimeString('en-IN')}
              </span>
              <span className={clsx('badge text-[10px] shrink-0', STATUS_CONFIG[h.toState]?.color || 'badge-ghost')}>
                {h.toState}
              </span>
              {h.reason && <span className="text-slate-400 text-[11px] truncate">{h.reason}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function TransferSimulator() {
  const [form, setForm] = useState({
    senderId: '',
    receiverId: '',
    amount: '',
    idempotencyKey: uuidv4(),
  })
  const [txnId, setTxnId] = useState(null)
  const [isIdempotencyHit, setIsIdempotencyHit] = useState(false)
  const addToast = useAppStore((s) => s.addToast)
  const qc = useQueryClient()

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
      setIsIdempotencyHit(!!txn._idempotencyHit)

      if (txn._idempotencyHit) {
        addToast({
          type: 'info',
          title: '⚡ Idempotency Hit',
          message: 'Duplicate request detected! Returned cached snapshot without second debit.',
        })
      } else if (txn.status === 'SUCCESS') {
        addToast({ type: 'success', title: 'Transfer Successful', message: `₹${form.amount} sent successfully` })
      } else if (txn.status === 'RECOVERY_PENDING') {
        addToast({ type: 'warning', title: 'Transfer Queued for Retry', message: 'Downstream credit failed. Retry scheduled.' })
      } else {
        addToast({ type: 'warning', title: 'Transfer Processed', message: `Status: ${txn.status}` })
      }
      qc.invalidateQueries({ queryKey: ['users'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
    },
    onError: (err) => {
      addToast({ type: 'error', title: 'Transfer Failed', message: err.message })
    },
  })

  const rollbackMut = useMutation({
    mutationFn: () => rollbackTransfer(txnId),
    onSuccess: () => {
      refetchTxn()
      qc.invalidateQueries({ queryKey: ['users'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
      addToast({ type: 'success', title: 'Compensating Rollback Completed', message: 'Sender has been refunded' })
    },
    onError: (err) => {
      addToast({ type: 'error', title: 'Rollback Failed', message: err.message })
    },
  })

  const users = usersData || []
  const senderOptions = users.filter((u) => u.id !== form.receiverId)
  const receiverOptions = users.filter((u) => u.id !== form.senderId)

  const handleSend = (regenerateKey = true) => {
    if (!form.senderId || !form.receiverId || !form.amount) {
      addToast({ type: 'warning', title: 'Validation', message: 'Please select sender, receiver, and amount' })
      return
    }

    const currentKey = regenerateKey ? uuidv4() : form.idempotencyKey
    if (regenerateKey) {
      setForm((prev) => ({ ...prev, idempotencyKey: currentKey }))
      setIsIdempotencyHit(false)
    }

    mutation.mutate({
      senderId: form.senderId,
      receiverId: form.receiverId,
      amount: parseFloat(form.amount),
      idempotencyKey: currentKey,
    })
  }

  const senderUser = users.find((u) => u.id === form.senderId)
  const receiverUser = users.find((u) => u.id === form.receiverId)

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Transfer Simulator"
        subtitle="Simulate real-time cross-bank UPI transactions with state machine visualization"
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Form Card */}
        <div className="card space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-300">Initiate Transfer</h2>
            <span className="text-xs text-slate-500 font-mono">Two-Phase Switch</span>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); handleSend(true) }} className="space-y-4">
            {/* Sender */}
            <div>
              <label className="label">Sender Account</label>
              <select
                className="select"
                value={form.senderId}
                onChange={(e) => setForm({ ...form, senderId: e.target.value })}
              >
                <option value="">Select sender...</option>
                {senderOptions.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} — {u.upiId} (₹{u.accounts?.[0]?.balance?.toLocaleString('en-IN')})
                  </option>
                ))}
              </select>
            </div>

            {/* Receiver */}
            <div>
              <label className="label">Receiver Account</label>
              <select
                className="select"
                value={form.receiverId}
                onChange={(e) => setForm({ ...form, receiverId: e.target.value })}
              >
                <option value="">Select receiver...</option>
                {receiverOptions.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} — {u.upiId} ({u.accounts?.[0]?.bank?.name || 'Bank'})
                  </option>
                ))}
              </select>
            </div>

            {/* Amount */}
            <div>
              <label className="label">Amount (₹)</label>
              <input
                type="number"
                className="input"
                placeholder="Enter amount in ₹..."
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                min="1"
                max="1000000"
              />
              <div className="flex flex-wrap gap-2 mt-2">
                {[500, 1000, 5000, 10000].map((a) => (
                  <button
                    key={a}
                    type="button"
                    className="btn-ghost text-xs py-1 px-2.5 border border-surface-600 hover:border-brand-500"
                    onClick={() => setForm({ ...form, amount: a })}
                  >
                    ₹{a.toLocaleString('en-IN')}
                  </button>
                ))}
                {/* Demo 5 trigger button */}
                <button
                  type="button"
                  className="btn-ghost text-xs py-1 px-2.5 border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 flex items-center gap-1"
                  onClick={() => setForm({ ...form, amount: 55000 })}
                  title="Amounts > ₹50,000 trigger the fraud engine"
                >
                  <AlertTriangle size={11} />
                  ₹55,000 (Fraud Spike)
                </button>
              </div>
            </div>

            {/* Idempotency Key Section (Demo 2 UI Element) */}
            <div className="rounded-lg bg-surface-900 border border-surface-700 p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-medium flex items-center gap-1.5">
                  <Key size={13} className="text-sky-400" />
                  Idempotency Key
                </span>
                <button
                  type="button"
                  className="text-sky-400 hover:text-sky-300 text-[11px] flex items-center gap-1"
                  onClick={() => {
                    const k = uuidv4()
                    setForm({ ...form, idempotencyKey: k })
                    setIsIdempotencyHit(false)
                  }}
                >
                  <RefreshCw size={11} />
                  New Key
                </button>
              </div>
              <input
                type="text"
                className="input text-xs font-mono py-1.5 text-slate-300 bg-surface-800"
                value={form.idempotencyKey}
                onChange={(e) => setForm({ ...form, idempotencyKey: e.target.value })}
                placeholder="Client-provided idempotency key"
              />
              <p className="text-[11px] text-slate-500">
                Guarantees exactly-once execution. Replaying this key prevents double debits.
              </p>
            </div>

            {/* Preview Banner */}
            {senderUser && receiverUser && form.amount && (
              <div className="rounded-lg bg-surface-900/90 border border-surface-700 p-3 flex items-center gap-3 text-sm">
                <div className="text-right flex-1 truncate">
                  <p className="text-slate-200 font-medium text-xs">{senderUser.name}</p>
                  <p className="text-slate-500 text-[11px] font-mono">{senderUser.upiId}</p>
                </div>
                <div className="flex flex-col items-center shrink-0">
                  <ArrowRight size={16} className="text-brand-400" />
                  <span className="text-brand-400 font-bold text-xs font-mono">{formatCurrency(parseFloat(form.amount) || 0)}</span>
                </div>
                <div className="flex-1 truncate">
                  <p className="text-slate-200 font-medium text-xs">{receiverUser.name}</p>
                  <p className="text-slate-500 text-[11px] font-mono">{receiverUser.upiId}</p>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                type="submit"
                className="btn-primary flex-1"
                disabled={mutation.isPending}
              >
                {mutation.isPending ? (
                  <><Spinner size="sm" /> Processing...</>
                ) : (
                  <><ArrowRight size={14} /> Send Transfer</>
                )}
              </button>

              {/* Demo 2 Resend Button */}
              <button
                type="button"
                className="btn-secondary text-xs px-3 flex items-center gap-1.5 border border-sky-500/30 text-sky-300 hover:bg-sky-500/10"
                onClick={() => handleSend(false)}
                disabled={mutation.isPending || !form.amount}
                title="Resend with the exact same Idempotency Key to test duplicate prevention"
              >
                <Zap size={14} />
                Resend (Idempotency Test)
              </button>
            </div>
          </form>
        </div>

        {/* Live Flow Visualizer */}
        <div>
          {txnData ? (
            <TransferFlowVisualizer
              transaction={txnData}
              onRollback={() => rollbackMut.mutate()}
              isRollingBack={rollbackMut.isPending}
              isIdempotencyHit={isIdempotencyHit}
            />
          ) : (
            <div className="card h-full flex flex-col items-center justify-center text-center py-16">
              <div className="w-12 h-12 rounded-full bg-brand-500/10 flex items-center justify-center mb-4 text-brand-400">
                <ArrowRight size={20} />
              </div>
              <p className="text-slate-300 font-medium">Visual State Machine</p>
              <p className="text-slate-500 text-sm mt-1 max-w-xs">
                Select sender, receiver, and amount to watch the two-phase distributed state transitions in real-time.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
