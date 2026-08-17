import { useQuery } from '@tanstack/react-query'
import { getMetrics } from '../lib/api'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { Spinner, PageHeader } from '../components/ui'
import { formatCurrency } from '../lib/constants'
import {
  ArrowLeftRight, CheckCircle2, XCircle, ShieldAlert,
  Users, RefreshCw, TrendingUp, Zap,
} from 'lucide-react'
import { format } from 'date-fns'

const COLORS = {
  success: '#10b981',
  failed:  '#ef4444',
  rolledBack: '#a855f7',
  brand: '#0ea5e9',
}

function MetricCard({ icon: Icon, label, value, sub, color = 'brand' }) {
  const colorMap = {
    brand: 'text-sky-400 bg-sky-500/10',
    success: 'text-emerald-400 bg-emerald-500/10',
    danger: 'text-red-400 bg-red-500/10',
    warning: 'text-amber-400 bg-amber-500/10',
    purple: 'text-purple-400 bg-purple-500/10',
  }
  return (
    <div className="card hover:border-surface-600 transition-colors duration-200">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-400 mb-1">{label}</p>
          <p className="text-3xl font-bold text-slate-100">{value}</p>
          {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorMap[color]}`}>
          <Icon size={20} />
        </div>
      </div>
    </div>
  )
}

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

export default function Dashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['metrics'],
    queryFn: getMetrics,
    refetchInterval: 5000,
    select: (d) => d.data,
  })

  if (isLoading) return (
    <div className="flex items-center justify-center h-96">
      <Spinner size="lg" />
    </div>
  )

  if (error) return (
    <div className="card text-red-400">Failed to load metrics: {error.message}</div>
  )

  const { summary, performance, fraud, banks, trends } = data || {}

  const trendData = (trends || []).map((t) => ({
    time: format(new Date(t.time), 'HH:mm'),
    Success: t.success,
    Failed: t.failed,
    'Rolled Back': t.rolledBack,
  }))

  const pieData = [
    { name: 'Success', value: summary?.successCount || 0, color: COLORS.success },
    { name: 'Failed', value: summary?.failedCount || 0, color: COLORS.failed },
    { name: 'Rolled Back', value: summary?.rolledBackCount || 0, color: COLORS.rolledBack },
  ].filter(d => d.value > 0)

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Dashboard"
        subtitle="Real-time overview of the PayMesh UPI switch"
        actions={
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live — refreshes every 5s
          </div>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard icon={ArrowLeftRight} label="Total Transactions" value={summary?.total ?? 0} color="brand" />
        <MetricCard icon={CheckCircle2} label="Success Rate" value={`${summary?.successRate ?? 0}%`} sub={`${summary?.successCount} succeeded`} color="success" />
        <MetricCard icon={XCircle} label="Failure Rate" value={`${summary?.failureRate ?? 0}%`} sub={`${summary?.failedCount + summary?.rolledBackCount} failed`} color="danger" />
        <MetricCard icon={ShieldAlert} label="Fraud Alerts" value={fraud?.total ?? 0} sub={`${fraud?.highRisk} HIGH_RISK`} color="warning" />
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard icon={Zap} label="TPS (Current)" value={performance?.tps ?? 0} sub={`${performance?.tpm}/min avg`} color="brand" />
        <MetricCard icon={TrendingUp} label="Avg Latency" value={`${performance?.avgLatencyMs ?? 0}ms`} color="brand" />
        <MetricCard icon={RefreshCw} label="Total Retries" value={summary?.retryCount ?? 0} color="purple" />
        <MetricCard icon={Users} label="Rollbacks" value={summary?.rolledBackCount ?? 0} color="danger" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Trend Chart */}
        <div className="card xl:col-span-2">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">Transactions Over Time (24h)</h2>
          {trendData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-slate-500 text-sm">
              No transaction data yet. Try running a transfer!
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={trendData}>
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="Success" stroke={COLORS.success} fill={`${COLORS.success}20`} strokeWidth={2} />
                <Area type="monotone" dataKey="Failed" stroke={COLORS.failed} fill={`${COLORS.failed}20`} strokeWidth={2} />
                <Area type="monotone" dataKey="Rolled Back" stroke={COLORS.rolledBack} fill={`${COLORS.rolledBack}20`} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Pie Chart */}
        <div className="card">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">Success vs Failure</h2>
          {pieData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-slate-500 text-sm">No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                  {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Bank Status */}
      <div className="card">
        <h2 className="text-sm font-semibold text-slate-300 mb-4">Bank Status</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(banks || []).map((bank) => (
            <div key={bank.code} className={`rounded-lg p-4 border ${bank.isCrashed ? 'border-red-500/30 bg-red-500/5' : 'border-surface-700 bg-surface-900'}`}>
              <div className="flex items-center gap-2 mb-2">
                <span className={bank.isCrashed ? 'status-dot-offline' : 'status-dot-online'} />
                <span className="font-medium text-sm text-slate-200">{bank.name}</span>
              </div>
              <div className="space-y-1 text-xs text-slate-400">
                <p>Delay: <span className="text-slate-300 font-mono">{bank.delayMs}ms</span></p>
                <p>Failure Rate: <span className="text-slate-300 font-mono">{(bank.failureRate * 100).toFixed(0)}%</span></p>
                <p>Status: <span className={bank.isCrashed ? 'text-red-400' : 'text-emerald-400'}>{bank.isCrashed ? 'OFFLINE' : 'ONLINE'}</span></p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
