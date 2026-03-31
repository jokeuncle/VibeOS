import { motion } from 'framer-motion'
import { CheckCircle2, Circle, Loader2, Play, Code2, ExternalLink, Zap } from 'lucide-react'
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
import type { RichBlock, RichAction, PhaseStatus, TaskPriority, ExecutionStatus } from '../types'
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

export function RichBlockRenderer({
  block,
  richLayout = 'default',
}: {
  block: RichBlock
  richLayout?: 'default' | 'home'
}) {
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
      return (
        <CTAActionsBlock
          block={block}
          layout={richLayout === 'home' ? 'stack' : 'inline'}
        />
      )

    case 'execution_timeline':
      return <ExecutionTimelineBlock block={block} />

    case 'nlp_action':
      return <NlpActionBlock block={block} layout={richLayout === 'home' ? 'card' : 'chip'} />

    case 'requirement_preview':
      return <RequirementPreviewCard block={block} />

    case 'action_card': {
      const acSurface =
        richLayout === 'home'
          ? 'rounded-xl border border-border-subtle bg-surface-2/40 p-3.5'
          : 'rounded-lg border border-border-subtle bg-surface-2/50 p-3'
      return (
        <div className={`${acSurface} space-y-2`}>
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
    }

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

    case 'task_card': {
      const tcWrap =
        richLayout === 'home'
          ? 'rounded-xl border border-border-subtle bg-surface-2/40 p-3.5'
          : 'rounded-lg border border-accent/20 bg-accent/[0.03] p-3'
      const tcIcon =
        richLayout === 'home'
          ? 'w-9 h-9 rounded-xl bg-surface-3/80 border border-border-subtle'
          : 'w-8 h-8 rounded-lg bg-accent/10'
      return (
        <div className={`${tcWrap} flex items-center gap-3`}>
          <div className={`${tcIcon} flex items-center justify-center shrink-0`}>
            <Play className={`w-3.5 h-3.5 ${richLayout === 'home' ? 'text-text-secondary' : 'text-accent'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-text-primary truncate">{block.taskTitle}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
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
    }

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

    case 'execution_result':
      return <ExecutionResultBlock block={block} richLayout={richLayout} />

    default:
      return null
  }
}

const EXEC_STATUS_STYLES: Record<string, string> = {
  success: 'bg-success/10 text-success border-success/20',
  failed: 'bg-danger/10 text-danger border-danger/20',
  running: 'bg-accent/10 text-accent border-accent/20',
  queued: 'bg-surface-3 text-text-tertiary border-border-subtle',
  cancelled: 'bg-surface-3 text-text-tertiary border-border-subtle',
}

function ExecutionResultBlock({ block, richLayout }: { block: RichBlock; richLayout: string }) {
  const { executions, setActiveWorkspace } = useWorkspaceStore()
  const { setActiveRequirement } = useWorkspaceStore()
  const t = useT()

  const liveExec = block.executionId ? executions.find((e) => e.id === block.executionId) : undefined
  const status: ExecutionStatus = (liveExec?.status || 'success') as ExecutionStatus
  const statusStyle = EXEC_STATUS_STYLES[status] || EXEC_STATUS_STYLES.queued
  const StatusIcon = status === 'success' ? CheckCircle2 : status === 'failed' ? Circle : status === 'running' ? Loader2 : Circle

  const isHome = richLayout === 'home'
  const wrapClass = isHome
    ? 'rounded-xl border border-border-subtle bg-surface-2/40 p-3.5'
    : 'rounded-lg border border-border-subtle bg-surface-2/50 p-3'

  function handleNavigate() {
    if (block.linkedWorkspaceId) {
      setActiveWorkspace(block.linkedWorkspaceId)
    } else if (block.linkedRequirementId) {
      setActiveRequirement(block.linkedRequirementId)
    }
  }

  return (
    <div className={`${wrapClass} space-y-2`}>
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
          <Zap className="w-3.5 h-3.5 text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-text-primary truncate">
            {block.resultSummary || block.title || t('execution.result' as TranslationKey)}
          </p>
          {block.resultType && (
            <span className="text-[10px] text-text-tertiary font-mono">{block.resultType}</span>
          )}
        </div>
        <span className={`inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded-md border ${statusStyle}`}>
          <StatusIcon className={`w-2.5 h-2.5 ${status === 'running' ? 'animate-spin' : ''}`} />
          {status}
        </span>
      </div>

      {block.linkedTaskIds && block.linkedTaskIds.length > 0 && (
        <p className="text-[10px] text-text-tertiary">
          {block.linkedTaskIds.length} {t('task.plural' as TranslationKey)}
        </p>
      )}

      {(block.linkedWorkspaceId || block.linkedRequirementId) && (
        <button
          onClick={handleNavigate}
          className="flex items-center gap-1 text-[11px] text-accent hover:text-accent-hover transition-colors cursor-pointer"
        >
          <ExternalLink className="w-3 h-3" />
          {isHome ? t('workspace.open' as TranslationKey) : t('execution.viewDetails' as TranslationKey)}
        </button>
      )}
    </div>
  )
}
