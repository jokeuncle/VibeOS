import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Zap, CheckCircle2, XCircle, Loader2, SkipForward, CircleDot, MessageSquare } from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspace'
import { useT } from '../i18n'
import type { UnifiedEvent, Phase } from '../types'
import type { TranslationKey } from '../i18n/en'

const EVENT_ICON: Record<string, typeof CheckCircle2> = {
  'phase:start': CircleDot,
  'phase:complete': CheckCircle2,
  'phase:skip': SkipForward,
  'task:start': Loader2,
  'task:complete': CheckCircle2,
  'task:error': XCircle,
  'project:start': Zap,
  'project:complete': CheckCircle2,
  'project:error': XCircle,
}

const EVENT_COLOR: Record<string, string> = {
  'phase:start': 'text-accent',
  'phase:complete': 'text-success',
  'phase:skip': 'text-text-tertiary',
  'task:start': 'text-accent animate-spin',
  'task:complete': 'text-success',
  'task:error': 'text-danger',
  'project:start': 'text-accent',
  'project:complete': 'text-success',
  'project:error': 'text-danger',
}

export default function WorkflowControls({ phases }: { phases: Phase[] }) {
  const { workflowRunning, workflowEvents, runPhase, runProject, activePhaseId } = useWorkspaceStore()
  const t = useT()
  const [userMessage, setUserMessage] = useState('')
  const [showMsgInput, setShowMsgInput] = useState(false)

  function phaseName(type: string | undefined): string {
    if (!type) return ''
    const key = `phase.${type}` as TranslationKey
    return t(key) || type
  }

  function eventLabel(event: UnifiedEvent): string {
    const key = `${event.category}:${event.action}`
    const d = event.data
    switch (key) {
      case 'project:start': return t('workflow.projectStart' as TranslationKey)
      case 'project:complete': return t('workflow.projectComplete' as TranslationKey)
      case 'phase:start': return `${t('workflow.phaseStart' as TranslationKey)}：${phaseName(d.phase)}`
      case 'phase:complete': {
        const ok = d.tasks_executed ?? 0
        const total = d.tasks_total
        const failed = d.tasks_failed ?? 0
        const name = phaseName(d.phase)
        if (total != null && failed > 0) {
          return `${name} ${t('workflow.phaseComplete' as TranslationKey)}（${ok}/${total}，${failed} ${t('workflow.taskError' as TranslationKey)}）`
        }
        if (total != null && total !== ok) {
          return `${name} ${t('workflow.phaseComplete' as TranslationKey)}（${ok}/${total} ${t('progress.tasks' as TranslationKey)}）`
        }
        return `${name} ${t('workflow.phaseComplete' as TranslationKey)}（${ok} ${t('progress.tasks' as TranslationKey)}）`
      }
      case 'phase:skip': return `${phaseName(d.phase)} ${t('workflow.phaseSkip' as TranslationKey)}：${d.reason ?? ''}`
      case 'task:start': return `[${(d.index ?? 0) + 1}/${d.total ?? '?'}] ${d.task_title ?? ''}`
      case 'task:complete': return `${t('workflow.taskComplete' as TranslationKey)}：${d.task_title ?? d.task_id ?? ''}`
      case 'task:error': return `${t('workflow.taskError' as TranslationKey)}：${d.task_title ?? d.task_id ?? ''} - ${d.error ?? 'unknown'}`
      default: return key
    }
  }

  const runPhaseType =
    phases.find((p) => p.id === activePhaseId)?.type
    ?? phases.find((p) => p.status !== 'completed')?.type
    ?? phases[0]?.type

  const hasEvents = workflowEvents.length > 0

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-1 overflow-hidden">
      <div className="px-4 py-3 space-y-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => runPhaseType && runPhase(runPhaseType, userMessage || undefined)}
            disabled={workflowRunning}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              workflowRunning
                ? 'bg-surface-3 text-text-tertiary cursor-not-allowed'
                : 'bg-accent/10 text-accent hover:bg-accent/20'
            }`}
          >
            {workflowRunning ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5" />
            )}
            {workflowRunning ? t('workflow.running' as TranslationKey) : t('workflow.runPhase' as TranslationKey)}
            {!workflowRunning && runPhaseType && (
              <span className="text-[10px] text-text-tertiary font-mono ml-1">
                ({runPhaseType})
              </span>
            )}
          </button>

          <button
            onClick={() => runProject(userMessage || undefined)}
            disabled={workflowRunning}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              workflowRunning
                ? 'bg-surface-3 text-text-tertiary cursor-not-allowed'
                : 'bg-gradient-to-r from-accent to-purple-500 text-white hover:opacity-90'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            {t('workflow.runProject' as TranslationKey)}
          </button>

          <button
            onClick={() => setShowMsgInput(!showMsgInput)}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              showMsgInput ? 'bg-accent/10 text-accent' : 'text-text-tertiary hover:bg-surface-3'
            }`}
            title={t('workflow.addInstructions' as TranslationKey)}
          >
            <MessageSquare className="w-3.5 h-3.5" />
          </button>
        </div>

        <AnimatePresence>
          {showMsgInput && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <input
                type="text"
                value={userMessage}
                onChange={(e) => setUserMessage(e.target.value)}
                placeholder={t('workflow.instructionPlaceholder' as TranslationKey)}
                className="w-full px-3 py-1.5 rounded-lg border border-border-default bg-surface-2 text-xs text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent/40"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {hasEvents && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-border-subtle overflow-hidden"
          >
            <div className="px-4 py-2 max-h-48 overflow-y-auto space-y-1">
              {workflowEvents.map((event, i) => {
                const key = `${event.category}:${event.action}`
                const Icon = EVENT_ICON[key] || CircleDot
                const color = EVENT_COLOR[key] || 'text-text-tertiary'
                return (
                  <div key={i} className="flex items-center gap-2 py-0.5">
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${color}`} />
                    <span className="text-[11px] text-text-secondary truncate">
                      {eventLabel(event)}
                    </span>
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
