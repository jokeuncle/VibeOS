import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, XCircle, Loader2, ChevronRight } from 'lucide-react'
import { getToolDisplay } from '../lib/toolDisplayRegistry'
import { ToolOutputRenderer, ToolInputRenderer } from './ToolOutputRenderer'
import type { ToolInvocation } from '../types'

const STATUS_STYLE = {
  calling: { ring: 'border-accent/30', bg: 'bg-accent/[0.04]' },
  completed: { ring: 'border-border-subtle', bg: 'bg-surface-2/20' },
  error: { ring: 'border-danger/25', bg: 'bg-danger/[0.03]' },
} as const

function StatusIcon({ status }: { status: ToolInvocation['status'] }) {
  if (status === 'calling')
    return <Loader2 className="w-3.5 h-3.5 text-accent animate-spin" />
  if (status === 'error')
    return <XCircle className="w-3.5 h-3.5 text-danger" />
  return <CheckCircle2 className="w-3.5 h-3.5 text-success" />
}

function formatDuration(ms?: number) {
  if (!ms) return null
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

function CollapsibleSection({
  label,
  defaultOpen,
  children,
}: {
  label: string
  defaultOpen: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[10px] font-medium text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer py-0.5"
      >
        <ChevronRight
          className={`w-3 h-3 shrink-0 transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
        />
        {label}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="pl-4 pt-1">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function ToolInvocationBlock({ invocation }: { invocation: ToolInvocation }) {
  const { status, toolName, displayName, input, output, error, durationMs } = invocation
  const display = getToolDisplay(toolName)
  const Icon = display.icon
  const style = STATUS_STYLE[status]
  const duration = formatDuration(durationMs)
  const label = displayName || display.label || toolName

  const hasInput = input && Object.keys(input).length > 0
  const hasOutput = !!(output || error)

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`rounded-lg border ${style.ring} ${style.bg} transition-colors duration-200`}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="w-6 h-6 rounded-md bg-surface-2/60 flex items-center justify-center shrink-0">
          <Icon className="w-3 h-3 text-text-secondary" />
        </div>
        <span className="flex-1 min-w-0 text-[11px] font-medium text-text-primary truncate">
          {label}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {duration && status !== 'calling' && (
            <span className="text-[10px] font-mono text-text-tertiary tabular-nums">
              {duration}
            </span>
          )}
          <StatusIcon status={status} />
        </div>
      </div>

      {(hasInput || hasOutput) && (
        <div className="px-3 pb-2 space-y-1 border-t border-border-subtle/30 pt-1.5">
          {hasInput && (
            <CollapsibleSection label="Input" defaultOpen={status === 'calling'}>
              <ToolInputRenderer data={input!} />
            </CollapsibleSection>
          )}
          {error && (
            <CollapsibleSection label="Error" defaultOpen>
              <ToolOutputRenderer text={error} isError />
            </CollapsibleSection>
          )}
          {output && !error && (
            <CollapsibleSection label="Output" defaultOpen={false}>
              <ToolOutputRenderer text={output} />
            </CollapsibleSection>
          )}
        </div>
      )}
    </motion.div>
  )
}
