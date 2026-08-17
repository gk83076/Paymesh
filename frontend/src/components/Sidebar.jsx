import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Users, ArrowLeftRight, List,
  ShieldAlert, Zap, Activity, BookOpen,
} from 'lucide-react'
import clsx from 'clsx'

const NAV = [
  { to: '/',           icon: LayoutDashboard, label: 'Dashboard'  },
  { to: '/accounts',   icon: Users,            label: 'Accounts'   },
  { to: '/transfer',   icon: ArrowLeftRight,   label: 'Transfer'   },
  { to: '/transactions',icon: List,            label: 'Transactions'},
  { to: '/fraud',      icon: ShieldAlert,      label: 'Fraud'      },
  { to: '/chaos',      icon: Zap,              label: 'Chaos'      },
  { to: '/monitoring', icon: Activity,         label: 'Monitoring' },
]

export default function Sidebar() {
  return (
    <aside className="w-60 shrink-0 flex flex-col bg-surface-900 border-r border-surface-700 h-screen sticky top-0">
      {/* Logo */}
      <div className="p-6 border-b border-surface-700">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-violet-500 flex items-center justify-center">
            <span className="text-white font-bold text-sm">₹</span>
          </div>
          <div>
            <h1 className="font-bold text-slate-100 text-base leading-tight">PayMesh</h1>
            <p className="text-[10px] text-slate-500 tracking-wide uppercase">UPI Switch Simulator</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                isActive
                  ? 'bg-brand-600/20 text-brand-400 border border-brand-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-surface-800'
              )
            }
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-surface-700">
        <a
          href="/api/docs"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          <BookOpen size={12} />
          API Documentation
        </a>
        <p className="text-[10px] text-slate-600 mt-2">
          PayMesh v1.0 — Production Sim
        </p>
      </div>
    </aside>
  )
}
