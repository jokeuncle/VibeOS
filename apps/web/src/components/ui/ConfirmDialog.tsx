import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'
import { useUIStore } from '../../stores/ui'
import { useT } from '../../i18n'

export default function ConfirmDialog() {
  const t = useT()
  const { confirmDialog, hideConfirm } = useUIStore()

  function handleConfirm() {
    confirmDialog?.onConfirm()
    hideConfirm()
  }

  return (
    <AnimatePresence>
      {confirmDialog && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-[90]"
            onClick={hideConfirm}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm z-[91] rounded-2xl border border-border-default bg-surface-1 shadow-2xl shadow-black/40 p-6"
          >
            <div className="flex items-start gap-3 mb-4">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                confirmDialog.danger ? 'bg-danger/10' : 'bg-accent/10'
              }`}>
                <AlertTriangle className={`w-4.5 h-4.5 ${confirmDialog.danger ? 'text-danger' : 'text-accent'}`} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-text-primary mb-1">
                  {confirmDialog.title}
                </h3>
                <p className="text-xs text-text-tertiary leading-relaxed">
                  {confirmDialog.message}
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={hideConfirm}
                className="px-4 py-2 rounded-lg bg-surface-3 hover:bg-surface-4 text-text-secondary text-xs font-medium cursor-pointer transition-colors"
              >
                {t('confirm.cancel')}
              </button>
              <button
                onClick={handleConfirm}
                className={`px-4 py-2 rounded-lg text-white text-xs font-medium cursor-pointer transition-colors ${
                  confirmDialog.danger
                    ? 'bg-danger hover:bg-danger/80'
                    : 'bg-accent hover:bg-accent-hover'
                }`}
              >
                {t('confirm.confirm')}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
