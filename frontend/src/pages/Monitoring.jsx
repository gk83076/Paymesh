import { useQuery } from '@tanstack/react-query'
import { getMetrics } from '../lib/api'
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'
import { Spinner, PageHeader } from '../components/ui'
import { format } from 'date-fns'
import { Activity, Zap, Clock, RefreshCw, XCircle, TrendingUp } from 'lucide-react'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-surface-800 border border-surface-600 rounded-lg p-3 text-xs">
      <p className="text-slate-400 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: {p.value}</p>
      ))}
    </div>
  )
}

function StatCard({ icon: Icon, label, value, unit, color }) {
  const colorMap = {
    brand: 'text-sky-400',
    success: 'text-emerald-400',
    danger: 'text-red-400',
    warning: 'text-amber-400',
    purple: 'text-purple-400',
  }
  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} className={colorMap[color] || 'text-sky-400'} />
        <span className="text-xs text-slate-400">{label}</span>
      </div>
      <p className={`text-3xl font-bold ${colorMap[color]}`}>
        {value}<span className="text-lg ml-1 text-slate-500">{unit}</span>
      </p>
    </div>
  )
}

export default function Monitoring() {
  const { data, isLoading } = useQuery({
    queryKey: ['metrics'],
    queryFn: getMetrics,
    refetchInterval: 3000,
    select: (d) => d.data,
  })

  if (isLoading) return (
    <div className="flex items-center justify-center h-96"><Spinner size="lg" /></div>
  )

  const { summary, performance, fraud, queue, banks, trends } = data || {}

  const trendData = (trends || []).map((t) => ({
    time: format(new Date(t.time), 'HH:mm'),
    Success: t.success,
    Failed: t.failed,
    'Rolled Back': t.rolledBack,
  }))

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Monitoring"
        subtitle="Real-time system observability"
        actions={
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live — refreshes every 3s
          </div>
        }
      />

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard icon={Zap} label="TPS" value={performance?.tps ?? 0} unit="tx/s" color="brand" />
        <StatCard icon={Clock} label="Avg Latency" value={performance?.avgLatencyMs ?? 0} unit="ms" color="brand" />
        <StatCard icon={TrendingUp} label="Success %" value={summary?.successRate ?? 0} unit="%" color="success" />
        <StatCard icon={XCircle} label="Failure %" value={summary?.failureRate ?? 0} unit="%" color="danger" />
        <StatCard icon={RefreshCw} label="Retries" value={summary?.retryCount ?? 0} unit="" color="purple" />
        <StatCard icon={Activity} label="Rollbacks" value={summary?.rolledBackCount ?? 0} unit="" color="danger" />
      </div>

      {/* Trend Chart */}
      <div className="card">
        <h2 className="text-sm font-semibold text-slate-300 mb-4">Transaction Trends (24h)</h2>
        {trendData.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-slate-500 text-sm">No data yet</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="Success" stroke="#10b981" fill="#10b98120" strokeWidth={2} />
              <Area type="monotone" dataKey="Failed" stroke="#ef4444" fill="#ef444420" strokeWidth={2} />
              <Area type="monotone" dataKey="Rolled Back" stroke="#a855f7" fill="#a855f720" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Queue + Fraud grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* BullMQ Queue */}
        <div className="card">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">Retry Queue (BullMQ)</h2>
          <div className="space-y-3">
            {[
              { label: 'Waiting', value: queue?.waiting ?? 0, color: 'bg-sky-500' },
              { label: 'Active', value: queue?.active ?? 0, color: 'bg-amber-500' },
              { label: 'Completed', value: queue?.completed ?? 0, color: 'bg-emerald-500' },
              { label: 'Failed', value: queue?.failed ?? 0, color: 'bg-red-500' },
              { label: 'Delayed', value: queue?.delayed ?? 0, color: 'bg-purple-500' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                <span className="text-slate-400 text-xs w-20">{item.label}</span>
                <div className="flex-1 bg-surface-900 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${item.color} transition-all duration-500`}
                    style={{ width: `${Math.min((item.value / (Math.max(queue?.completed || 1, 1))) * 100, 100)}%` }}
                  />
                </div>
                <span className="text-slate-300 text-xs font-mono w-8 text-right">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Fraud Summary */}
        <div className="card">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">Fraud Detection Summary</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-sm">Total Flagged</span>
              <span className="text-slate-200 font-semibold">{fraud?.total ?? 0}</span>
            </div>
            <div className="space-y-2">
              {[
                { label: 'High Risk', value: fraud?.highRisk ?? 0, color: 'bg-red-500', badge: 'badge-danger' },
                { label: 'Suspicious', value: fraud?.suspicious ?? 0, color: 'bg-amber-500', badge: 'badge-warning' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-3">
                  <span className={`${item.badge} text-xs w-24`}>{item.label}</span>
                  <div className="flex-1 bg-surface-900 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${item.color}`}
                      style={{ width: fraud?.total ? `${(item.value / fraud.total) * 100}%` : '0%' }}
                    />
                  </div>
                  <span className="text-slate-300 text-xs font-mono w-8 text-right">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bank Health */}
      <div className="card">
        <h2 className="text-sm font-semibold text-slate-300 mb-4">Bank Health</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(banks || []).map((bank) => (
            <div key={bank.code} className={`rounded-lg p-4 border ${bank.isCrashed ? 'border-red-500/30 bg-red-500/5' : 'border-surface-700 bg-surface-900'}`}>
              <div className="flex items-center gap-2 mb-3">
                <span className={bank.isCrashed ? 'status-dot-offline' : 'status-dot-online'} />
                <span className="font-semibold text-sm text-slate-200">{bank.name}</span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Latency</span>
                  <span className="font-mono text-slate-300">{bank.delayMs}ms</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Error Rate</span>
                  <span className={`font-mono ${bank.failureRate > 0.3 ? 'text-red-400' : 'text-slate-300'}`}>
                    {(bank.failureRate * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Status</span>
                  <span className={bank.isCrashed ? 'text-red-400' : 'text-emerald-400'}>
                    {bank.isCrashed ? 'DOWN' : 'UP'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
