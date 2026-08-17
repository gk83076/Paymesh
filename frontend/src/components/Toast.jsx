import { useEffect } from 'react'
import { X, CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import clsx from 'clsx'

const ICONS = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
}

const STYLES = {
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  error:   'border-red-500/30 bg-red-500/10 text-red-300',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  info:    'border-sky-500/30 bg-sky-500/10 text-sky-300',
}

function Toast({ toast }) {
  const removeToast = useAppStore((s) => s.removeToast)
  const Icon = ICONS[toast.type] || Info

  useEffect(() => {
    const timer = setTimeout(() => removeToast(toast.id), toast.duration || 4000)
    return () => clearTimeout(timer)
  }, [toast.id])

  return (
    <div className={clsx(
      'flex items-start gap-3 px-4 py-3 rounded-lg border text-sm animate-slide-up max-w-sm',
      STYLES[toast.type] || STYLES.info
    )}>
      <Icon size={16} className="mt-0.5 shrink-0" />
      <div className="flex-1">
        {toast.title && <p className="font-medium">{toast.title}</p>}
        {toast.message && <p className="opacity-80 text-xs mt-0.5">{toast.message}</p>}
      </div>
      <button onClick={() => removeToast(toast.id)} className="opacity-60 hover:opacity-100">
        <X size={14} />
      </button>
    </div>
  )
}

export default function ToastContainer() {
  const toasts = useAppStore((s) => s.toasts)
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => <Toast key={t.id} toast={t} />)}
    </div>
  )
}
