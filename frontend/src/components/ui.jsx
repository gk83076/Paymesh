import clsx from 'clsx'
import { STATUS_CONFIG, RISK_CONFIG } from '../lib/constants'

export function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || { label: status, color: 'badge-ghost' }
  return <span className={cfg.color}>{cfg.label}</span>
}

export function RiskBadge({ riskLevel }) {
  const cfg = RISK_CONFIG[riskLevel] || { label: riskLevel, color: 'badge-ghost' }
  return <span className={cfg.color}>{cfg.label}</span>
}

export function FraudScore({ score }) {
  const color = score >= 70
    ? 'text-red-400'
    : score >= 40
    ? 'text-amber-400'
    : 'text-emerald-400'
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-surface-700 rounded-full overflow-hidden">
        <div
          className={clsx('h-full rounded-full transition-all', {
            'bg-emerald-400': score < 40,
            'bg-amber-400': score >= 40 && score < 70,
            'bg-red-400': score >= 70,
          })}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className={clsx('text-xs font-mono font-medium', color)}>{score}</span>
    </div>
  )
}

export function Spinner({ size = 'md' }) {
  const sz = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-8 h-8' : 'w-6 h-6'
  return (
    <div className={clsx('animate-spin rounded-full border-2 border-surface-600 border-t-brand-400', sz)} />
  )
}

export function EmptyState({ title, description, icon: Icon }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {Icon && <Icon size={40} className="text-slate-600 mb-4" />}
      <h3 className="text-slate-300 font-medium">{title}</h3>
      {description && <p className="text-slate-500 text-sm mt-1">{description}</p>}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">{title}</h1>
        {subtitle && <p className="text-slate-400 text-sm mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
