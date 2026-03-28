import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Zap, CheckCircle2, XCircle, Loader2, SkipForward, CircleDot, MessageSquare } from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspace'
import { useT } from '../i18n'
import type { WorkflowEvent, Phase } from '../types'
import type { TranslationKey } from '../i18n/en'

const EVENT_ICON: Record<string, typeof CheckCircle2> = {
  'workflow:phase_start': CircleDot,
  'workflow:phase_complete': CheckCircle2,
  'workflow:phase_skip': SkipForward,
  'workflow:task_start': Loader2,
  'workflow:task_complete': CheckCircle2,
  'workflow:task_error': XCircle,
  'workflow:project_start': Zap,
  'workflow:project_complete': CheckCircle2,
  'workflow:project_error': XCircle,
}

const EVENT_COLOR: Record<string, string> = {
  'workflow:phase_start': 'text-accent',
  'workflow:phase_complete': 'text-success',
  'workflow:phase_skip': 'text-text-tertiary',
  'workflow:task_start': 'text-accent animate-spin',
  'workflow:task_complete': 'text-success',
  'workflow:task_error': 'text-danger',
  'workflow:project_start': 'text-accent',
  'workflow:project_complete': 'text-success',
  'workflow:project_error': 'text-danger',
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

  function eventLabel(event: WorkflowEvent): string {
    switch (event.type) {
      case 'workflow:project_start': return t('workflow.projectStart' as TranslationKey)
      case 'workflow:project_complete': return t('workflow.projectComplete' as TranslationKey)
      case 'workflow:phase_start': return `${t('workflow.phaseStart' as TranslationKey)}：${phaseName(event.phase)}`
      case 'workflow:phase_complete': {
        const ok = event.tasks_executed ?? 0
        const total = event.tasks_total
        const failed = event.tasks_failed ?? 0
        const name = phaseName(event.phase)
        if (total != null && failed > 0) {
          return `${name} ${t('workflow.phaseComplete' as TranslationKey)}（${ok}/${total}，${failed} ${t('workflow.taskError' as TranslationKey)}）`
        }
        if (total != null && total !== ok) {
          return `${name} ${t('workflow.phaseComplete' as TranslationKey)}（${ok}/${total} ${t('progress.tasks' as TranslationKey)}）`
        }
        return `${name} ${t('workflow.phaseComplete' as TranslationKey)}（${ok} ${t('progress.tasks' as TranslationKey)}）`
      }
      case 'workflow:phase_skip': return `${phaseName(event.phase)} ${t('workflow.phaseSkip' as TranslationKey)}：${event.reason ?? ''}`
      case 'workflow:task_start': return `[${(event.index ?? 0) + 1}/${event.total ?? '?'}] ${event.task_title ?? ''}`
      case 'workflow:task_complete': return `${t('workflow.taskComplete' as TranslationKey)}：${event.task_title ?? event.task_id ?? ''}`
      case 'workflow:task_error': return `${t('workflow.taskError' as TranslationKey)}：${event.task_title ?? event.task_id ?? ''} - ${event.error ?? 'unknown'}`
      default: return event.type
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
                const Icon = EVENT_ICON[event.type] || CircleDot
                const color = EVENT_COLOR[event.type] || 'text-text-tertiary'
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
