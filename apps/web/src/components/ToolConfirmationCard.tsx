import { useCallback } from 'react'
import { motion } from 'framer-motion'
import { ShieldQuestion, Check, X, CheckCircle2, XCircle } from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspace'
import { getConfirmationResolution } from '../stores/workspace/slices/chatSlice'
import { getToolDisplay } from '../lib/toolDisplayRegistry'
import { ToolInputRenderer } from './ToolOutputRenderer'
import type { ToolInvocation } from '../types'

function resolveState(invocation: ToolInvocation): 'pending' | 'approved' | 'rejected' {
  if (invocation.status === 'confirmed' || invocation.status === 'completed')
    return 'approved'
  if (invocation.status === 'rejected' || invocation.status === 'error')
    return 'rejected'
  if (invocation.confirmationKey) {
    const stored = getConfirmationResolution(invocation.confirmationKey)
    if (stored === 'confirmed') return 'approved'
    if (stored === 'rejected') return 'rejected'
  }
  return 'pending'
}

export function ToolConfirmationCard({ invocation }: { invocation: ToolInvocation }) {
  const { toolName, displayName, input, confirmationKey } = invocation
  const state = resolveState(invocation)
  const sendConfirmation = useWorkspaceStore((s) => s.sendToolConfirmation)

  const display = getToolDisplay(toolName)
  const Icon = display.icon
  const label = displayName || display.label || toolName
  const hasInput = input && Object.keys(input).length > 0

  const handleResolve = useCallback(
    (approved: boolean) => {
      if (!confirmationKey) return
      sendConfirmation(confirmationKey, approved, toolName, input)
    },
    [confirmationKey, toolName, input, sendConfirmation],
  )

  if (state === 'approved') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-2/20 px-3 py-1.5">
        <div className="w-5 h-5 rounded-md bg-surface-2/40 flex items-center justify-center shrink-0">
          <Icon className="w-3 h-3 text-text-tertiary" />
        </div>
        <span className="text-[11px] text-text-secondary truncate flex-1">{label}</span>
        <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />
      </div>
    )
  }

  if (state === 'rejected') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-2/20 px-3 py-1.5">
        <div className="w-5 h-5 rounded-md bg-surface-2/40 flex items-center justify-center shrink-0">
          <Icon className="w-3 h-3 text-text-tertiary" />
        </div>
        <span className="text-[11px] text-text-tertiary truncate flex-1 line-through">{label}</span>
        <XCircle className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="rounded-lg border border-amber-500/25 bg-amber-500/[0.04]"
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="w-6 h-6 rounded-md bg-amber-500/10 flex items-center justify-center shrink-0">
          <ShieldQuestion className="w-3.5 h-3.5 text-amber-500" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[11px] font-medium text-text-primary truncate block">
            {label}
          </span>
          <span className="text-[10px] text-text-tertiary">需要确认后执行</span>
        </div>
        <div className="w-5 h-5 rounded-md bg-surface-2/60 flex items-center justify-center shrink-0">
          <Icon className="w-3 h-3 text-text-secondary" />
        </div>
      </div>

      {hasInput && (
        <div className="px-3 pb-2 border-t border-border-subtle/30 pt-1.5">
          <span className="text-[10px] font-medium text-text-tertiary block mb-1">参数</span>
          <ToolInputRenderer data={input!} />
        </div>
      )}

      <div className="flex gap-2 px-3 pb-2.5">
        <button
          onClick={() => handleResolve(true)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-accent text-white text-[11px] font-medium cursor-pointer hover:bg-accent-hover transition-colors"
        >
          <Check className="w-3 h-3" />
          确认执行
        </button>
        <button
          onClick={() => handleResolve(false)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-md border border-border-subtle bg-surface-2/40 text-[11px] font-medium text-text-secondary cursor-pointer hover:bg-surface-2/60 transition-colors"
        >
          <X className="w-3 h-3" />
          取消
        </button>
      </div>
    </motion.div>
  )
}
