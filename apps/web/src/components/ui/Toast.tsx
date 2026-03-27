import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, XCircle, Info, X } from 'lucide-react'
import { useUIStore, type Toast as ToastType } from '../../stores/ui'

const icons = {
  success: <CheckCircle2 className="w-4 h-4 text-success" />,
  error: <XCircle className="w-4 h-4 text-danger" />,
  info: <Info className="w-4 h-4 text-accent" />,
}

const borders = {
  success: 'border-success/20',
  error: 'border-danger/20',
  info: 'border-accent/20',
}

function ToastItem({ toast }: { toast: ToastType }) {
  const { removeToast } = useUIStore()

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.95 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border ${borders[toast.type]} bg-surface-2 shadow-xl shadow-black/20 min-w-[280px] max-w-[400px]`}
    >
      {icons[toast.type]}
      <span className="flex-1 text-sm text-text-primary">{toast.message}</span>
      <button
        onClick={() => removeToast(toast.id)}
        className="text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer p-0.5"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  )
}

export default function ToastContainer() {
  const { toasts } = useUIStore()

  return (
    <div className="fixed bottom-12 right-4 z-[100] flex flex-col gap-2 items-end">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} />
        ))}
      </AnimatePresence>
    </div>
  )
}
