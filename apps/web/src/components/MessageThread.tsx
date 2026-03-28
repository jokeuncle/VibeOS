import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bot, User, ChevronDown, CheckCircle2, Circle, Loader2, Play, Code2 } from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspace'
import { useUIStore } from '../stores/ui'
import { useT } from '../i18n'
import type { Message, RichBlock, RichAction, PhaseStatus, TaskPriority } from '../types'
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

function RichBlockRenderer({ block }: { block: RichBlock }) {
  const { addToast } = useUIStore()
  const { addTask, activeWorkspaceId, workspaces } = useWorkspaceStore()
  const t = useT()

  function handleAction(action: RichAction) {
    const workspace = workspaces.find((w) => w.id === activeWorkspaceId)
    switch (action.id) {
      case 'approve':
        addToast({ type: 'success', message: t('rich.actionApproved') })
        break
      case 'cancel':
        addToast({ type: 'info', message: t('rich.actionCancelled') })
        break
      case 'confirm':
        if (block.taskTitle && activeWorkspaceId && workspace) {
          const firstPhase = workspace.phases[0]
          if (firstPhase) addTask(activeWorkspaceId, firstPhase.id, block.taskTitle)
        }
        addToast({ type: 'success', message: t('rich.actionConfirmed') })
        break
      case 'apply':
        addToast({ type: 'success', message: t('rich.actionApplied') })
        break
      case 'dismiss':
        addToast({ type: 'info', message: t('rich.actionDismissed') })
        break
      case 'proceed':
        addToast({ type: 'info', message: t('rich.actionProceeding') })
        break
      case 'detail':
        addToast({ type: 'info', message: t('rich.actionDetail') })
        break
      case 'modify':
        addToast({ type: 'info', message: t('rich.actionDetail') })
        break
      default:
        addToast({ type: 'info', message: `${action.label}` })
    }
  }

  switch (block.type) {
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
  }
}

function SystemMessage({ msg }: { msg: Message }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2 py-0.5"
    >
      <div className="flex-1 h-px bg-border-subtle" />
      <span className="text-[10px] text-text-tertiary font-mono shrink-0">{msg.content}</span>
      <div className="flex-1 h-px bg-border-subtle" />
    </motion.div>
  )
}

function MessageBubble({ msg }: { msg: Message }) {
  const t = useT()
  if (msg.role === 'system') return <SystemMessage msg={msg} />

  const agentLabel = msg.agentType
    ? t(`agent.name.${msg.agentType}` as TranslationKey)
    : t('conversation.agent')

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex gap-2.5"
    >
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
        msg.role === 'user' ? 'bg-surface-3 text-text-tertiary' : 'bg-accent/10 text-accent'
      }`}>
        {msg.role === 'user' ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-text-secondary">
            {msg.role === 'user' ? t('conversation.you') : agentLabel}
          </span>
          <span className="text-[10px] text-text-tertiary/50 font-mono">
            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        {msg.content && (
          <p className="text-xs text-text-primary/90 leading-relaxed">{msg.content}</p>
        )}
        {msg.richBlocks && msg.richBlocks.length > 0 && (
          <div className="space-y-2 mt-1">
            {msg.richBlocks.map((block, i) => (
              <RichBlockRenderer key={i} block={block} />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}

interface Session {
  id: string
  messages: Message[]
  timestamp: string
}

function groupIntoSessions(messages: Message[]): Session[] {
  const sessions: Session[] = []
  let current: Session | null = null

  for (const msg of messages) {
    const sid = msg.sessionId || 'default'
    if (!current || current.id !== sid) {
      current = { id: sid, messages: [msg], timestamp: msg.timestamp }
      sessions.push(current)
    } else {
      current.messages.push(msg)
    }
  }
  return sessions
}

export default function MessageThread() {
  const { messages } = useWorkspaceStore()
  const t = useT()
  const bottomRef = useRef<HTMLDivElement>(null)
  const [collapsedSessions, setCollapsedSessions] = useState<Set<string>>(new Set())

  const sessions = groupIntoSessions(messages)
  const lastMsgContent = messages[messages.length - 1]?.content

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, lastMsgContent])

  if (messages.length === 0) return null

  function toggleSession(id: string) {
    setCollapsedSessions((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.35 }}
      className="rounded-xl border border-border-subtle bg-surface-1/30 overflow-hidden"
    >
      <div className="px-4 py-3 border-b border-border-subtle flex items-center gap-2">
        <Bot className="w-3.5 h-3.5 text-text-tertiary" />
        <span className="text-xs font-medium text-text-secondary">{t('conversation.title')}</span>
        <span className="text-[10px] font-mono text-text-tertiary ml-auto">{messages.length}</span>
      </div>

      <div className="max-h-[500px] overflow-y-auto">
        {sessions.map((session, si) => {
          const isCollapsed = collapsedSessions.has(session.id)

          return (
            <div key={session.id}>
              {/* Session header (only for multi-session) */}
              {sessions.length > 1 && (
                <button
                  onClick={() => toggleSession(session.id)}
                  className="w-full flex items-center gap-2 px-4 py-2 text-[10px] text-text-tertiary hover:bg-surface-2/30 cursor-pointer transition-colors"
                >
                  <div className="flex-1 h-px bg-border-subtle" />
                  <span className="font-mono shrink-0">
                    {new Date(session.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {isCollapsed && ` · ${session.messages.length} ${t('session.collapsed')}`}
                  </span>
                  <div className="flex-1 h-px bg-border-subtle" />
                  <ChevronDown className={`w-3 h-3 transition-transform ${isCollapsed ? '' : 'rotate-180'}`} />
                </button>
              )}

              <AnimatePresence initial={false}>
                {!isCollapsed && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="p-4 space-y-4">
                      {session.messages.map((msg) => (
                        <MessageBubble key={msg.id} msg={msg} />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
    </motion.div>
  )
}
