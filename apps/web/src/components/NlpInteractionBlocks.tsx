import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Target, Bot, Zap, AlertTriangle, XCircle, ServerOff,
  HelpCircle, Lightbulb, RotateCcw, ArrowRight,
  CheckCircle2, Loader2, Circle, ChevronRight, Sparkles, Play,
} from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspace'
import { useUIStore } from '../stores/ui'
import { useT } from '../i18n'
import { workspaceApi } from '../lib/api'
import type { RichBlock, RichAction, ClarificationOption, ExecutionStep, NlpActionType } from '../types'
import type { TranslationKey } from '../i18n/en'

// ---------------------------------------------------------------------------
// IntentFeedback: animated intent routing display
// ---------------------------------------------------------------------------

export function IntentFeedbackBlock({ block }: { block: RichBlock }) {
  const t = useT()
  const confidence = block.confidence ?? 1

  const confidenceColor =
    confidence >= 0.8 ? 'text-success' :
    confidence >= 0.5 ? 'text-amber-400' : 'text-danger'
  const confidenceBg =
    confidence >= 0.8 ? 'bg-success/10 border-success/20' :
    confidence >= 0.5 ? 'bg-amber-400/10 border-amber-400/20' : 'bg-danger/10 border-danger/20'

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="rounded-xl border border-accent/20 bg-accent/[0.04] p-3 space-y-2.5"
    >
      <div className="flex items-center gap-2">
        <motion.div
          initial={{ rotate: -90, opacity: 0 }}
          animate={{ rotate: 0, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.4, type: 'spring' }}
          className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center"
        >
          <Target className="w-3.5 h-3.5 text-accent" />
        </motion.div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-text-secondary">
              {t('nlp.intentRecognized' as TranslationKey)}
            </span>
            <motion.span
              initial={{ width: 0 }}
              animate={{ width: 'auto' }}
              transition={{ delay: 0.2, duration: 0.3 }}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border overflow-hidden ${confidenceBg} ${confidenceColor}`}
            >
              {Math.round(confidence * 100)}%
            </motion.span>
          </div>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.15, duration: 0.3 }}
        className="flex items-center gap-2 ml-9"
      >
        <span className="text-xs font-medium text-accent">{block.intentLabel}</span>
        <ChevronRight className="w-3 h-3 text-text-tertiary/40" />
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-surface-2 border border-border-subtle text-[11px] font-medium text-text-secondary">
          <Bot className="w-3 h-3 text-accent" />
          {block.agentLabel}
        </span>
      </motion.div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// ClarificationCard: disambiguation options
// ---------------------------------------------------------------------------

export function ClarificationBlock({ block }: { block: RichBlock }) {
  const t = useT()
  const { sendNLPMessageStream } = useWorkspaceStore()
  const [selected, setSelected] = useState<string | null>(null)

  function handleSelect(option: ClarificationOption) {
    setSelected(option.id)
    sendNLPMessageStream(`[intent:${option.intent}] ${option.label}`)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-4 space-y-3"
    >
      <div className="flex items-start gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-amber-400/10 flex items-center justify-center shrink-0 mt-0.5">
          <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
        </div>
        <div>
          <p className="text-[11px] font-semibold text-amber-400">
            {t('nlp.clarifyTitle' as TranslationKey)}
          </p>
          <p className="text-xs text-text-secondary mt-0.5">
            {block.clarifyPrompt}
          </p>
        </div>
      </div>

      <div className="space-y-1.5 ml-9">
        {block.clarifyOptions?.map((option, i) => (
          <motion.button
            key={option.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 + i * 0.06 }}
            onClick={() => handleSelect(option)}
            disabled={selected !== null}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-left transition-all cursor-pointer ${
              selected === option.id
                ? 'border-accent/40 bg-accent/10'
                : selected
                  ? 'border-border-subtle bg-surface-1/30 opacity-50'
                  : 'border-border-subtle bg-surface-1/50 hover:border-accent/30 hover:bg-accent/[0.04]'
            }`}
          >
            <Zap className={`w-3.5 h-3.5 shrink-0 ${selected === option.id ? 'text-accent' : 'text-text-tertiary'}`} />
            <div className="flex-1 min-w-0">
              <span className="text-xs font-medium text-text-primary">{option.label}</span>
              {option.agentType && (
                <span className="ml-2 text-[10px] text-text-tertiary">→ {option.agentType}</span>
              )}
            </div>
            {selected === option.id && (
              <Loader2 className="w-3 h-3 text-accent animate-spin" />
            )}
          </motion.button>
        ))}
      </div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// ErrorCard: differentiated error states
// ---------------------------------------------------------------------------

const ERROR_ICON: Record<string, typeof AlertTriangle> = {
  intent_unclear: HelpCircle,
  capability_limit: AlertTriangle,
  agent_unavailable: ServerOff,
  system_error: XCircle,
}

const ERROR_COLOR: Record<string, { border: string; bg: string; icon: string; title: string }> = {
  intent_unclear: {
    border: 'border-amber-400/20',
    bg: 'bg-amber-400/[0.04]',
    icon: 'text-amber-400 bg-amber-400/10',
    title: 'text-amber-400',
  },
  capability_limit: {
    border: 'border-orange-400/20',
    bg: 'bg-orange-400/[0.04]',
    icon: 'text-orange-400 bg-orange-400/10',
    title: 'text-orange-400',
  },
  agent_unavailable: {
    border: 'border-red-400/20',
    bg: 'bg-red-400/[0.04]',
    icon: 'text-red-400 bg-red-400/10',
    title: 'text-red-400',
  },
  system_error: {
    border: 'border-red-500/20',
    bg: 'bg-red-500/[0.04]',
    icon: 'text-red-500 bg-red-500/10',
    title: 'text-red-500',
  },
}

const ERROR_TITLE: Record<string, TranslationKey> = {
  intent_unclear: 'nlp.error.intentUnclear' as TranslationKey,
  capability_limit: 'nlp.error.capabilityLimit' as TranslationKey,
  agent_unavailable: 'nlp.error.agentUnavailable' as TranslationKey,
  system_error: 'nlp.error.systemError' as TranslationKey,
}

export function ErrorCardBlock({ block }: { block: RichBlock }) {
  const t = useT()
  const { sendNLPMessageStream } = useWorkspaceStore()
  const severity = block.errorSeverity || 'system_error'
  const colors = ERROR_COLOR[severity] || ERROR_COLOR.system_error
  const Icon = ERROR_ICON[severity] || XCircle

  function handleAction(action: RichAction) {
    if (action.id === 'retry') {
      sendNLPMessageStream('retry')
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border ${colors.border} ${colors.bg} p-4 space-y-3`}
    >
      <div className="flex items-start gap-2.5">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${colors.icon}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-[11px] font-semibold ${colors.title}`}>
            {t(ERROR_TITLE[severity])}
          </p>
          <p className="text-xs text-text-secondary mt-0.5 leading-relaxed">
            {block.errorMessage}
          </p>
        </div>
      </div>

      {block.errorHints && block.errorHints.length > 0 && (
        <div className="ml-9 space-y-1">
          {block.errorHints.map((hint, i) => (
            <div key={i} className="flex items-center gap-2">
              <Lightbulb className="w-3 h-3 text-text-tertiary shrink-0" />
              <span className="text-[11px] text-text-tertiary">{hint}</span>
            </div>
          ))}
        </div>
      )}

      {block.errorActions && block.errorActions.length > 0 && (
        <div className="flex gap-1.5 ml-9 pt-1">
          {block.errorActions.map((a) => (
            <button
              key={a.id}
              onClick={() => handleAction(a)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer transition-colors ${
                a.variant === 'primary'
                  ? 'bg-accent hover:bg-accent-hover text-white'
                  : 'bg-surface-3 hover:bg-surface-4 text-text-secondary border border-border-subtle'
              }`}
            >
              {a.id === 'retry' && <RotateCcw className="w-3 h-3 inline mr-1 -mt-0.5" />}
              {a.label}
            </button>
          ))}
        </div>
      )}
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// CTAActions: post-completion action buttons
// ---------------------------------------------------------------------------

export function CTAActionsBlock({
  block,
  layout = 'inline',
}: {
  block: RichBlock
  layout?: 'inline' | 'stack'
}) {
  const { sendNLPMessageStream } = useWorkspaceStore()
  const [clicked, setClicked] = useState<string | null>(null)

  function handleCTA(action: RichAction) {
    setClicked(action.id)
    const commandMap: Record<string, string> = {
      view_detail: '/status current',
      view_tasks: '/status tasks',
      continue_refine: '继续优化这个需求',
      proceed: '开始执行',
      followup: '',
    }
    const cmd = commandMap[action.id]
    if (cmd) sendNLPMessageStream(cmd)
  }

  if (!block.ctaActions?.length) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className={
        layout === 'stack'
          ? 'flex flex-col gap-2 pt-1 w-full'
          : 'flex flex-wrap gap-1.5 pt-1'
      }
    >
      {block.ctaActions.map((a, i) => (
        <motion.button
          key={a.id}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.25 + i * 0.05 }}
          onClick={() => handleCTA(a)}
          disabled={clicked !== null}
          className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all cursor-pointer ${
            layout === 'stack' ? 'w-full' : ''
          } ${
            clicked === a.id
              ? 'bg-accent/20 text-accent border border-accent/30'
              : a.variant === 'primary'
                ? 'bg-accent hover:bg-accent-hover text-white'
                : 'bg-surface-2 hover:bg-surface-3 text-text-secondary border border-border-subtle'
          }`}
        >
          {a.variant === 'primary' && <ArrowRight className="w-3 h-3" />}
          {a.label}
          {clicked === a.id && <Loader2 className="w-3 h-3 animate-spin" />}
        </motion.button>
      ))}
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// NlpActionBlock: data-driven contextual action buttons
// ---------------------------------------------------------------------------

const ACTION_ICON: Record<string, React.ReactNode> = {
  workspace_create: <Sparkles className="w-3.5 h-3.5" />,
  task_execute: <Play className="w-3.5 h-3.5" />,
  phase_execute: <ArrowRight className="w-3.5 h-3.5" />,
  navigate: <ChevronRight className="w-3.5 h-3.5" />,
  confirm: <ArrowRight className="w-3.5 h-3.5" />,
}

export function NlpActionBlock({
  block,
  layout = 'chip',
}: {
  block: RichBlock
  layout?: 'chip' | 'card'
}) {
  const t = useT()
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const { setActiveWorkspace, sendNLPMessageStream, runPhase } = useWorkspaceStore()

  const actionType = block.actionType as NlpActionType | undefined
  if (!actionType) return null

  const label = block.actionLabel || t(`nlp.action.${actionType}` as TranslationKey) || actionType
  const variant = block.actionVariant || 'primary'
  const icon = ACTION_ICON[actionType] || <ArrowRight className="w-3.5 h-3.5" />

  async function handleClick() {
    if (loading || done) return
    setLoading(true)
    try {
      const payload = block.actionPayload || {}
      switch (actionType) {
        case 'workspace_create': {
          const name = (payload.suggested_name as string) || '新工作空间'
          const ws = await workspaceApi.create(name, '', 'indigo')
          useWorkspaceStore.setState((s) => ({ workspaces: [...s.workspaces, ws] }))
          setActiveWorkspace(ws.id)
          const query = (payload.original_query as string) || ''
          if (query) {
            setTimeout(() => useWorkspaceStore.getState().sendNLPMessageStream(query), 300)
          }
          useWorkspaceStore.getState().clearHomeMessages()
          useUIStore.getState().setHomeConversationVisible(false)
          break
        }
        case 'task_execute': {
          const taskId = payload.taskId as string
          if (taskId) sendNLPMessageStream(`execute task ${taskId}`)
          break
        }
        case 'phase_execute': {
          const phase = payload.phase as string
          if (phase) runPhase(phase)
          break
        }
        case 'navigate': {
          break
        }
        case 'confirm': {
          break
        }
      }
      setDone(true)
    } catch (err) {
      console.error('NlpActionBlock error:', err)
    } finally {
      setLoading(false)
    }
  }

  const variantClass =
    variant === 'primary'
      ? 'bg-accent hover:bg-accent-hover text-white'
      : variant === 'danger'
        ? 'bg-danger/10 hover:bg-danger/20 text-danger border border-danger/20'
        : 'bg-surface-2 hover:bg-surface-3 text-text-secondary border border-border-subtle'

  const cardVariantClass =
    variant === 'primary'
      ? 'border-accent/25 bg-accent/[0.08] text-accent hover:bg-accent/[0.14]'
      : variant === 'danger'
        ? 'border-danger/25 bg-danger/[0.06] text-danger hover:bg-danger/[0.1]'
        : 'border-border-subtle bg-surface-2/45 text-text-secondary hover:bg-surface-2/70'

  const layoutClass =
    layout === 'card'
      ? `flex w-full items-center justify-center gap-2 px-4 py-3 rounded-xl border text-[12px] font-medium shadow-sm ${cardVariantClass} ${
        done ? 'opacity-50 cursor-default' : ''
      }`
      : `inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[11px] font-medium ${
        done ? 'opacity-50 cursor-default' : variantClass
      }`

  return (
    <motion.button
      initial={{ opacity: 0, scale: layout === 'card' ? 1 : 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
      onClick={handleClick}
      disabled={loading || done}
      className={`transition-all cursor-pointer ${layoutClass}`}
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : icon}
      {loading ? t('nlp.action.creating' as TranslationKey) : label}
    </motion.button>
  )
}

// ---------------------------------------------------------------------------
// ExecutionTimeline: multi-step progress visualization
// ---------------------------------------------------------------------------

const STEP_ICON: Record<string, React.ReactNode> = {
  pending: <Circle className="w-3 h-3 text-text-tertiary/40" />,
  running: <Loader2 className="w-3 h-3 text-accent animate-spin" />,
  completed: <CheckCircle2 className="w-3 h-3 text-success" />,
  error: <XCircle className="w-3 h-3 text-danger" />,
}

export function ExecutionTimelineBlock({ block }: { block: RichBlock }) {
  const steps = block.steps || []
  if (steps.length === 0) return null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="rounded-xl border border-border-subtle bg-surface-1/30 p-3"
    >
      <div className="space-y-0">
        {steps.map((step, i) => (
          <TimelineStep key={step.id} step={step} isLast={i === steps.length - 1} index={i} />
        ))}
      </div>
    </motion.div>
  )
}

function TimelineStep({ step, isLast, index }: { step: ExecutionStep; isLast: boolean; index: number }) {
  const lineColor =
    step.status === 'completed' ? 'bg-success/30' :
    step.status === 'running' ? 'bg-accent/30' :
    step.status === 'error' ? 'bg-danger/30' : 'bg-border-subtle'

  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.08, duration: 0.25 }}
      className="flex gap-2.5"
    >
      <div className="flex flex-col items-center">
        <div className="w-5 h-5 flex items-center justify-center">
          {STEP_ICON[step.status]}
        </div>
        {!isLast && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 16 }}
            transition={{ delay: index * 0.08 + 0.1 }}
            className={`w-px ${lineColor}`}
          />
        )}
      </div>
      <div className={`flex-1 min-w-0 pb-2 ${isLast ? '' : ''}`}>
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
    </motion.div>
  )
}
