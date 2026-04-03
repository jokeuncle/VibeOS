import { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { ShieldQuestion, Check, X } from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspace'
import { getToolDisplay } from '../lib/toolDisplayRegistry'
import { ToolInputRenderer } from './ToolOutputRenderer'
import type { ToolInvocation } from '../types'

type ConfirmState = 'pending' | 'approved' | 'rejected'

export function ToolConfirmationCard({ invocation }: { invocation: ToolInvocation }) {
  const { toolName, displayName, input, confirmationKey } = invocation
  const [state, setState] = useState<ConfirmState>('pending')
  const sendConfirmation = useWorkspaceStore((s) => s.sendToolConfirmation)

  const display = getToolDisplay(toolName)
  const Icon = display.icon
  const label = displayName || display.label || toolName
  const hasInput = input && Object.keys(input).length > 0

  const handleResolve = useCallback(
    (approved: boolean) => {
      if (!confirmationKey) return
      setState(approved ? 'approved' : 'rejected')
      sendConfirmation(confirmationKey, approved, toolName, input)
    },
    [confirmationKey, toolName, input, sendConfirmation],
  )

  const resolved = state !== 'pending'

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
          <span className="text-[10px] text-text-tertiary">
            {resolved
              ? state === 'approved'
                ? '已确认执行'
                : '已取消'
              : '需要确认后执行'}
          </span>
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

      {!resolved && (
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
      )}

      {state === 'approved' && (
        <div className="px-3 pb-2 text-[10px] text-success flex items-center gap-1">
          <Check className="w-3 h-3" /> 已批准，正在执行...
        </div>
      )}
      {state === 'rejected' && (
        <div className="px-3 pb-2 text-[10px] text-text-tertiary flex items-center gap-1">
          <X className="w-3 h-3" /> 操作已取消
        </div>
      )}
    </motion.div>
  )
}
