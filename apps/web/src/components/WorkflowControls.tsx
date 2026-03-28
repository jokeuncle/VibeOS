import { motion, AnimatePresence } from 'framer-motion'
import { Play, Zap, CheckCircle2, XCircle, Loader2, SkipForward, CircleDot } from 'lucide-react'
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

function eventLabel(event: WorkflowEvent): string {
  switch (event.type) {
    case 'workflow:project_start': return 'Starting project lifecycle'
    case 'workflow:project_complete': return 'Project lifecycle complete!'
    case 'workflow:phase_start': return `Phase: ${event.phase}`
    case 'workflow:phase_complete': return `${event.phase} complete (${event.tasks_executed} tasks)`
    case 'workflow:phase_skip': return `${event.phase} skipped: ${event.reason}`
    case 'workflow:task_start': return `[${(event.index ?? 0) + 1}/${event.total ?? '?'}] ${event.task_title ?? ''}`
    case 'workflow:task_complete': return `Done: ${event.task_title ?? event.task_id ?? ''}`
    case 'workflow:task_error': return `Error: ${event.task_title ?? event.task_id ?? ''} - ${event.error ?? 'unknown'}`
    default: return event.type
  }
}

export default function WorkflowControls({ phases }: { phases: Phase[] }) {
  const { workflowRunning, workflowEvents, runPhase, runProject } = useWorkspaceStore()
  const t = useT()

  const currentPhase = phases.find((p) => p.status !== 'completed') || phases[0]
  const hasEvents = workflowEvents.length > 0

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-1 overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-3">
        <div className="flex items-center gap-2 flex-1">
          <button
            onClick={() => currentPhase && runPhase(currentPhase.type)}
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
            {!workflowRunning && currentPhase && (
              <span className="text-[10px] text-text-tertiary font-mono ml-1">
                ({currentPhase.type})
              </span>
            )}
          </button>

          <button
            onClick={runProject}
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
        </div>
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
