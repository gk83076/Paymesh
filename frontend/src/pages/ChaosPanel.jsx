import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getBankStatus, crashBankA, crashBankB, crashBankC, recoverBank, addBankDelay, setFailureRate, resetChaos } from '../lib/api'
import { useAppStore } from '../store/useAppStore'
import { PageHeader, Spinner } from '../components/ui'
import { Zap, Power, RefreshCw, Clock, AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import clsx from 'clsx'

function BankCard({ bank, onCrash, onRecover, onDelay, onFailureRate, isLoading }) {
  const [delay, setDelay] = useState(bank.delayMs || 0)
  const [rate, setRate] = useState((bank.failureRate * 100).toFixed(0))

  return (
    <div className={clsx('card space-y-4 transition-all duration-300', {
      'border-red-500/40 bg-red-500/5 shadow-[0_0_20px_rgba(239,68,68,0.1)]': bank.isCrashed,
      'border-surface-700': !bank.isCrashed,
    })}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={clsx('w-3 h-3 rounded-full', {
            'bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.6)]': bank.isCrashed,
            'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]': !bank.isCrashed,
          })} />
          <div>
            <h3 className="font-semibold text-slate-200">{bank.name}</h3>
            <p className="text-xs text-slate-500 font-mono">{bank.code}</p>
          </div>
        </div>
        <span className={clsx('badge', bank.isCrashed ? 'badge-danger' : 'badge-success')}>
          {bank.isCrashed ? 'OFFLINE' : 'ONLINE'}
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="bg-surface-900 rounded-lg p-2.5">
          <p className="text-slate-500 text-xs">Current Delay</p>
          <p className="font-mono font-semibold text-slate-200">{bank.delayMs}ms</p>
        </div>
        <div className="bg-surface-900 rounded-lg p-2.5">
          <p className="text-slate-500 text-xs">Failure Rate</p>
          <p className="font-mono font-semibold text-slate-200">{(bank.failureRate * 100).toFixed(0)}%</p>
        </div>
      </div>

      {/* Controls */}
      <div className="space-y-3">
        {/* Crash / Recover */}
        {bank.isCrashed ? (
          <button
            className="btn-success w-full"
            onClick={() => onRecover(bank.code)}
            disabled={isLoading}
          >
            <Power size={14} /> Bring Online
          </button>
        ) : (
          <button
            className="btn-danger w-full"
            onClick={() => onCrash(bank.code)}
            disabled={isLoading}
          >
            <Power size={14} /> Crash Bank
          </button>
        )}

        {/* Delay slider */}
        <div>
          <label className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="flex items-center gap-1"><Clock size={10} /> Network Delay</span>
            <span className="font-mono">{delay}ms</span>
          </label>
          <input
            type="range"
            min="0" max="5000" step="100"
            value={delay}
            onChange={(e) => setDelay(parseInt(e.target.value))}
            onMouseUp={() => onDelay(bank.code, delay)}
            className="w-full accent-sky-500"
          />
        </div>

        {/* Failure rate slider */}
        <div>
          <label className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="flex items-center gap-1"><AlertTriangle size={10} /> Failure Rate</span>
            <span className="font-mono">{rate}%</span>
          </label>
          <input
            type="range"
            min="0" max="100" step="5"
            value={rate}
            onChange={(e) => setRate(parseInt(e.target.value))}
            onMouseUp={() => onFailureRate(bank.code, parseInt(rate) / 100)}
            className="w-full accent-amber-500"
          />
        </div>
      </div>
    </div>
  )
}

export default function ChaosPanel() {
  const addToast = useAppStore((s) => s.addToast)
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['bank-status'],
    queryFn: getBankStatus,
    refetchInterval: 3000,
    select: (d) => d.data,
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['bank-status'] })

  const crashMutations = {
    BANK_A: useMutation({ mutationFn: crashBankA, onSuccess: (_, __, ctx) => { invalidate(); addToast({ type: 'warning', title: 'Bank A Crashed', message: 'Axis Virtual is now offline' }) } }),
    BANK_B: useMutation({ mutationFn: crashBankB, onSuccess: () => { invalidate(); addToast({ type: 'warning', title: 'Bank B Crashed', message: 'HDFC Sim is now offline' }) } }),
    BANK_C: useMutation({ mutationFn: crashBankC, onSuccess: () => { invalidate(); addToast({ type: 'warning', title: 'Bank C Crashed', message: 'SBI Sim is now offline' }) } }),
  }

  const recoverMutation = useMutation({
    mutationFn: (code) => recoverBank(code),
    onSuccess: () => { invalidate(); addToast({ type: 'success', title: 'Bank Recovered', message: 'Bank is back online' }) },
  })

  const delayMutation = useMutation({
    mutationFn: ({ code, ms }) => addBankDelay(code, ms),
    onSuccess: () => { invalidate(); addToast({ type: 'info', title: 'Delay Updated' }) },
  })

  const failureMutation = useMutation({
    mutationFn: ({ code, rate }) => setFailureRate(code, rate),
    onSuccess: () => { invalidate(); addToast({ type: 'info', title: 'Failure Rate Updated' }) },
  })

  const resetMutation = useMutation({
    mutationFn: resetChaos,
    onSuccess: () => { invalidate(); addToast({ type: 'success', title: 'Chaos Reset', message: 'All banks restored to normal' }) },
  })

  const banks = data || []
  const isMutating = Object.values(crashMutations).some((m) => m.isPending) || recoverMutation.isPending || resetMutation.isPending

  const handleCrash = (code) => {
    const m = crashMutations[code]
    if (m) m.mutate()
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Chaos Control Panel"
        subtitle="Simulate bank failures, latency, and failures to test system resilience"
        actions={
          <button className="btn-secondary" onClick={() => resetMutation.mutate()} disabled={resetMutation.isPending}>
            <RefreshCw size={14} className={resetMutation.isPending ? 'animate-spin' : ''} />
            Reset All Banks
          </button>
        }
      />

      {/* Warning banner */}
      <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-4 flex items-start gap-3">
        <Zap size={16} className="text-amber-400 shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="text-amber-300 font-medium">Chaos Engineering Mode</p>
          <p className="text-amber-400/70 text-xs mt-0.5">
            Crashing a bank will cause all subsequent transfers to/from that bank to fail immediately.
            Use this to test the retry engine, rollback flow, and system resilience.
          </p>
        </div>
      </div>

      {/* Bank Cards */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {banks.map((bank) => (
            <BankCard
              key={bank.code}
              bank={bank}
              isLoading={isMutating}
              onCrash={handleCrash}
              onRecover={(code) => recoverMutation.mutate(code)}
              onDelay={(code, ms) => delayMutation.mutate({ code, ms })}
              onFailureRate={(code, rate) => failureMutation.mutate({ code, rate })}
            />
          ))}
        </div>
      )}

      {/* Quick Actions */}
      <div className="card">
        <h2 className="text-sm font-semibold text-slate-300 mb-4">Quick Scenarios</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <button className="btn-secondary text-xs flex-col h-20 items-start gap-1"
            onClick={() => { handleCrash('BANK_A'); handleCrash('BANK_B') }}>
            <span className="font-semibold text-slate-200">Dual Bank Failure</span>
            <span className="text-slate-500">Crash Bank A + B simultaneously</span>
          </button>
          <button className="btn-secondary text-xs flex-col h-20 items-start gap-1"
            onClick={() => {
              ['BANK_A', 'BANK_B', 'BANK_C'].forEach(code => delayMutation.mutate({ code, ms: 3000 }))
            }}>
            <span className="font-semibold text-slate-200">High Latency Mode</span>
            <span className="text-slate-500">Set 3s delay on all banks</span>
          </button>
          <button className="btn-secondary text-xs flex-col h-20 items-start gap-1"
            onClick={() => {
              ['BANK_A', 'BANK_B', 'BANK_C'].forEach(code => failureMutation.mutate({ code, rate: 0.8 }))
            }}>
            <span className="font-semibold text-slate-200">High Failure Rate</span>
            <span className="text-slate-500">Set 80% failure on all banks</span>
          </button>
        </div>
      </div>
    </div>
  )
}
