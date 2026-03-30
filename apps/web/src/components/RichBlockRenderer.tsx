import { motion } from 'framer-motion'
import { CheckCircle2, Circle, Loader2, Play, Code2 } from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspace'
import { useUIStore } from '../stores/ui'
import { useT } from '../i18n'
import { RequirementPreviewCard } from './RequirementPreviewCard'
import {
  IntentFeedbackBlock,
  ClarificationBlock,
  ErrorCardBlock,
  CTAActionsBlock,
  ExecutionTimelineBlock,
  NlpActionBlock,
} from './NlpInteractionBlocks'
import type { RichBlock, RichAction, PhaseStatus, TaskPriority } from '../types'
import type { TranslationKey } from '../i18n/en'

function ProgressBar({ percent, label }: { percent: number; label?: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 bg-surface-3 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-accent"
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
      </div>
      <span className="text-[11px] font-mono text-text-secondary shrink-0">{percent}%</span>
      {label && <span className="text-[10px] text-text-tertiary shrink-0">{label}</span>}
    </div>
  )
}

function TaskStatusBadge({ status }: { status: PhaseStatus }) {
  const color = status === 'completed' ? 'bg-success/10 text-success border-success/20'
    : status === 'in_progress' ? 'bg-accent/10 text-accent border-accent/20'
    : 'bg-surface-3 text-text-tertiary border-border-subtle'
  const Icon = status === 'completed' ? CheckCircle2 : status === 'in_progress' ? Loader2 : Circle
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded-md border ${color}`}>
      <Icon className="w-2.5 h-2.5" />
      {status}
    </span>
  )
}

const PRIORITY_STYLE: Record<TaskPriority, string> = {
  p0: 'bg-red-500/10 text-red-400',
  p1: 'bg-orange-500/10 text-orange-400',
  p2: 'bg-yellow-500/10 text-yellow-400',
  p3: 'bg-blue-500/10 text-blue-400',
}

export function RichBlockRenderer({ block }: { block: RichBlock }) {
  const { addToast } = useUIStore()
  const { addTask, activeWorkspaceId, workspaces, sendNLPMessageStream } = useWorkspaceStore()
  const t = useT()

  function handleAction(action: RichAction) {
    const workspace = workspaces.find((w) => w.id === activeWorkspaceId)
    switch (action.id) {
      case 'approve':
        if (block.taskTitle && activeWorkspaceId) sendNLPMessageStream(`approve and proceed with: ${block.taskTitle}`)
        addToast({ type: 'success', message: t('rich.actionApproved') })
        break
      case 'cancel':
        addToast({ type: 'info', message: t('rich.actionCancelled') })
        break
      case 'confirm':
        if (block.taskTitle && activeWorkspaceId && workspace) {
          const matchPhase = workspace.phases.find((p) => p.status !== 'completed') || workspace.phases[0]
          if (matchPhase) addTask(activeWorkspaceId, matchPhase.id, block.taskTitle)
        }
        addToast({ type: 'success', message: t('rich.actionConfirmed') })
        break
      case 'apply':
        if (activeWorkspaceId && block.description) sendNLPMessageStream(`apply the following changes: ${block.description}`)
        addToast({ type: 'success', message: t('rich.actionApplied') })
        break
      case 'dismiss':
        addToast({ type: 'info', message: t('rich.actionDismissed') })
        break
      case 'proceed':
        if (activeWorkspaceId) sendNLPMessageStream('proceed to the next phase')
        addToast({ type: 'info', message: t('rich.actionProceeding') })
        break
      case 'detail':
        if (activeWorkspaceId && block.title) sendNLPMessageStream(`provide detailed analysis for: ${block.title}`)
        addToast({ type: 'info', message: t('rich.actionDetail') })
        break
      case 'modify':
        addToast({ type: 'info', message: t('rich.actionModify' as TranslationKey) })
        break
      default:
        addToast({ type: 'info', message: `${action.label}` })
    }
  }

  switch (block.type) {
    case 'intent_feedback':
      return <IntentFeedbackBlock block={block} />

    case 'clarification':
      return <ClarificationBlock block={block} />

    case 'error_card':
      return <ErrorCardBlock block={block} />

    case 'cta_actions':
      return <CTAActionsBlock block={block} />

    case 'execution_timeline':
      return <ExecutionTimelineBlock block={block} />

    case 'nlp_action':
      return <NlpActionBlock block={block} />

    case 'requirement_preview':
      return <RequirementPreviewCard block={block} />

    case 'action_card':
      return (
        <div className="rounded-lg border border-border-subtle bg-surface-2/50 p-3 space-y-2">
          {block.title && <p className="text-xs font-semibold text-text-primary">{block.title}</p>}
          {block.description && <p className="text-[11px] text-text-secondary leading-relaxed">{block.description}</p>}
          {block.actions && (
            <div className="flex gap-1.5 pt-1">
              {block.actions.map((a) => (
                <button
                  key={a.id}
                  onClick={() => handleAction(a)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer transition-colors ${
                    a.variant === 'primary' ? 'bg-accent hover:bg-accent-hover text-white'
                    : a.variant === 'danger' ? 'bg-danger/10 hover:bg-danger/20 text-danger border border-danger/20'
                    : 'bg-surface-3 hover:bg-surface-4 text-text-secondary border border-border-subtle'
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )

    case 'progress':
      return (
        <div className="rounded-lg border border-border-subtle bg-surface-2/50 p-3 space-y-2">
          {block.title && (
            <div className="flex items-center gap-2">
              <Loader2 className="w-3 h-3 text-accent animate-spin" style={{ animationDuration: '2s' }} />
              <span className="text-xs font-semibold text-text-primary">{block.title}</span>
            </div>
          )}
          <ProgressBar percent={block.percent || 0} label={block.statusLabel} />
        </div>
      )

    case 'code':
      return (
        <div className="rounded-lg border border-border-subtle overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-3 border-b border-border-subtle">
            <Code2 className="w-3 h-3 text-text-tertiary" />
            <span className="text-[10px] font-mono text-text-tertiary">{block.language || 'code'}</span>
          </div>
          <pre className="p-3 bg-surface-2/50 overflow-x-auto">
            <code className="text-[11px] font-mono text-text-primary leading-relaxed whitespace-pre">{block.code}</code>
          </pre>
        </div>
      )

    case 'task_card':
      return (
        <div className="rounded-lg border border-accent/20 bg-accent/[0.03] p-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
            <Play className="w-3.5 h-3.5 text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-text-primary truncate">{block.taskTitle}</p>
            <div className="flex items-center gap-2 mt-1">
              {block.taskStatus && <TaskStatusBadge status={block.taskStatus} />}
              {block.taskPriority && PRIORITY_STYLE[block.taskPriority] && (
                <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${PRIORITY_STYLE[block.taskPriority]}`}>
                  {block.taskPriority.toUpperCase()}
                </span>
              )}
            </div>
          </div>
        </div>
      )

    case 'checklist':
      return (
        <div className="rounded-lg border border-border-subtle bg-surface-2/50 p-3 space-y-1.5">
          {block.title && <p className="text-xs font-semibold text-text-primary mb-2">{block.title}</p>}
          {block.items?.map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              {item.checked
                ? <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />
                : <Circle className="w-3.5 h-3.5 text-text-tertiary/40 shrink-0" />}
              <span className={`text-[11px] ${item.checked ? 'text-text-tertiary line-through' : 'text-text-primary'}`}>
                {item.text}
              </span>
            </div>
          ))}
        </div>
      )

    default:
      return null
  }
}
