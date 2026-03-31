import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CheckCircle2, Circle, Loader2, XCircle,
  ChevronDown, Clock, RotateCcw, ExternalLink,
} from 'lucide-react'
import { useWorkspaceStore } from '../../stores/workspace'
import { getExecutionRenderer } from '../../lib/executionRegistry'
import type { AgentExecution, ExecutionStatus, ExecutionStep } from '../../types'
import type { TranslationKey } from '../../i18n/en'

type TFn = (k: any) => string

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<ExecutionStatus, { bg: string; text: string; label: TranslationKey }> = {
  queued:    { bg: 'bg-surface-3',      text: 'text-text-tertiary', label: 'execution.status.queued' as TranslationKey },
  running:   { bg: 'bg-accent/10',      text: 'text-accent',        label: 'execution.status.running' as TranslationKey },
  success:   { bg: 'bg-success/10',     text: 'text-success',       label: 'execution.status.success' as TranslationKey },
  failed:    { bg: 'bg-danger/10',      text: 'text-danger',        label: 'execution.status.failed' as TranslationKey },
  cancelled: { bg: 'bg-surface-3',      text: 'text-text-tertiary', label: 'execution.status.cancelled' as TranslationKey },
}

function ExecutionStatusBadge({ status, t }: { status: ExecutionStatus; t: TFn }) {
  const style = STATUS_STYLES[status]
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium ${style.bg} ${style.text}`}>
      {status === 'running' && <Loader2 className="w-2.5 h-2.5 animate-spin" style={{ animationDuration: '1.5s' }} />}
      {status === 'success' && <CheckCircle2 className="w-2.5 h-2.5" />}
      {status === 'failed' && <XCircle className="w-2.5 h-2.5" />}
      {t(style.label)}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Mini timeline (step indicators)
// ---------------------------------------------------------------------------

const STEP_ICON: Record<ExecutionStep['status'], React.ReactNode> = {
  pending:   <Circle className="w-3 h-3 text-text-tertiary/40" />,
  running:   <Loader2 className="w-3 h-3 text-accent animate-spin" style={{ animationDuration: '1.5s' }} />,
  completed: <CheckCircle2 className="w-3 h-3 text-success" />,
  error:     <XCircle className="w-3 h-3 text-danger" />,
}

function MiniTimeline({ steps }: { steps: ExecutionStep[] }) {
  if (steps.length === 0) return null

  return (
    <div className="space-y-0">
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1
        const lineColor =
          step.status === 'completed' ? 'bg-success/30' :
          step.status === 'running' ? 'bg-accent/30' :
          step.status === 'error' ? 'bg-danger/30' : 'bg-border-subtle'

        return (
          <div key={step.id} className="flex gap-2.5">
            <div className="flex flex-col items-center">
              <div className="w-5 h-5 flex items-center justify-center">
                {STEP_ICON[step.status]}
              </div>
              {!isLast && <div className={`w-px h-4 ${lineColor}`} />}
            </div>
            <div className="flex-1 min-w-0 pb-1">
              <span className={`text-[11px] font-medium ${
                step.status === 'running' ? 'text-accent' :
                step.status === 'completed' ? 'text-text-secondary' :
                step.status === 'error' ? 'text-danger' : 'text-text-tertiary'
              }`}>
                {step.label}
              </span>
              {step.detail && (
                <span className="text-[10px] text-text-tertiary ml-1.5">— {step.detail}</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Time display
// ---------------------------------------------------------------------------

function TimeAgo({ iso, t }: { iso: string; t: TFn }) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return <span className="text-[10px] text-text-tertiary">{t('execution.time.justNow' as TranslationKey)}</span>
  if (mins < 60) return <span className="text-[10px] text-text-tertiary">{mins}{t('execution.time.minAgo' as TranslationKey)}</span>
  const hrs = Math.floor(mins / 60)
  return <span className="text-[10px] text-text-tertiary">{hrs}{t('execution.time.hrAgo' as TranslationKey)}</span>
}

// ---------------------------------------------------------------------------
// ExecutionRow
// ---------------------------------------------------------------------------

export function ExecutionRow({
  execution,
  t,
  defaultExpanded = false,
}: {
  execution: AgentExecution
  t: TFn
  defaultExpanded?: boolean
}) {
  const [expanded, setExpanded] = useState(defaultExpanded || execution.status === 'running')
  const { sendNLPMessageStream } = useWorkspaceStore()

  const renderer = getExecutionRenderer(execution.resultType)
  const summaryText = renderer?.summaryLine(execution.resultPayload || {}, t) || ''
  const icon = renderer?.icon
  const iconTint = renderer?.iconTint || 'bg-surface-3 text-text-tertiary'
  const DetailPanel = renderer?.DetailPanel
  const quickActions = renderer?.quickActions?.(execution, t) || []

  const isActive = execution.status === 'running' || execution.status === 'queued'

  function handleRetry() {
    if (execution.userMessage) {
      sendNLPMessageStream(execution.userMessage)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`rounded-lg border transition-colors ${
        isActive
          ? 'border-accent/20 bg-accent/[0.02]'
          : 'border-border-subtle hover:bg-surface-2/35'
      }`}
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left cursor-pointer"
      >
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${iconTint}`}>
          {icon}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-text-primary truncate">
              {execution.intentSummary}
            </span>
          </div>
          {summaryText && (
            <p className="text-[10px] text-text-tertiary truncate mt-0.5">{summaryText}</p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {execution.estimatedDuration && isActive && (
            <span className="inline-flex items-center gap-1 text-[10px] text-text-tertiary">
              <Clock className="w-2.5 h-2.5" />
              {execution.estimatedDuration}
            </span>
          )}
          <ExecutionStatusBadge status={execution.status} t={t} />
          <TimeAgo iso={execution.startedAt} t={t} />
          <ChevronDown className={`w-3.5 h-3.5 text-text-tertiary transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* Expanded content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-border-subtle/50">
              {/* Steps timeline */}
              {execution.steps.length > 0 && (
                <div className="px-3 pt-3 pb-1">
                  <MiniTimeline steps={execution.steps} />
                </div>
              )}

              {/* Registry detail panel */}
              {DetailPanel && execution.resultPayload && (
                <DetailPanel execution={execution} t={t} />
              )}

              {/* Error message */}
              {execution.status === 'failed' && execution.errorMessage && (
                <div className="px-3 pb-2">
                  <div className="rounded-md bg-danger/5 border border-danger/15 px-2.5 py-2 text-[11px] text-danger leading-relaxed">
                    {execution.errorMessage}
                  </div>
                </div>
              )}

              {/* Actions */}
              {(quickActions.length > 0 || execution.status === 'failed') && (
                <div className="flex items-center gap-1.5 px-3 pb-3 pt-1">
                  {execution.status === 'failed' && execution.userMessage && (
                    <button
                      type="button"
                      onClick={handleRetry}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-accent hover:bg-accent-hover text-white transition-colors cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      {t('execution.retry' as TranslationKey)}
                    </button>
                  )}
                  {quickActions
                    .filter((a) => a.visible !== false)
                    .map((action) =>
                      action.href ? (
                        <a
                          key={action.id}
                          href={action.href}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-surface-3 hover:bg-surface-4 text-text-secondary border border-border-subtle transition-colors"
                        >
                          {action.icon || <ExternalLink className="w-3 h-3" />}
                          {action.label}
                        </a>
                      ) : (
                        <button
                          key={action.id}
                          type="button"
                          onClick={action.onClick}
                          className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                            action.variant === 'primary'
                              ? 'bg-accent hover:bg-accent-hover text-white'
                              : action.variant === 'danger'
                                ? 'bg-danger/10 hover:bg-danger/20 text-danger border border-danger/20'
                                : 'bg-surface-3 hover:bg-surface-4 text-text-secondary border border-border-subtle'
                          }`}
                        >
                          {action.icon}
                          {action.label}
                        </button>
                      ),
                    )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
