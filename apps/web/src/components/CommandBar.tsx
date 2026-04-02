import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles, ArrowUp, Command, Bot, Slash, CheckSquare,
  FileText, Blocks, Palette, Code2, FlaskConical, Rocket, Activity,
  X, ChevronRight, Target,
  PlusSquare, ListChecks, UserPlus, FileBarChart, Eye,
  type LucideIcon,
} from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspace'
import { useUIStore } from '../stores/ui'
import { useT } from '../i18n'
import type { TranslationKey } from '../i18n/en'
import { translateSeedTaskCopy } from '../lib/seedTaskI18n'
import { useActiveNlpContext, useSlashCommands } from '../hooks/useNlpContext'
interface Suggestion {
  id: string
  type: 'agent' | 'command' | 'task'
  label: string
  value: string
  description?: string
  /** Slash command string for Lucide icon (e.g. '/create') */
  slashCmd?: string
}

/** Per-command icons — avoids a generic slash glyph in the command palette. */
const SLASH_CMD_ICONS: Record<string, LucideIcon> = {
  '/create': PlusSquare,
  '/status': ListChecks,
  '/assign': UserPlus,
  '/deploy': Rocket,
  '/review': Eye,
  '/report': FileBarChart,
}

function SlashCommandSuggestIcon({ cmd }: { cmd: string }) {
  const Icon = SLASH_CMD_ICONS[cmd] ?? Slash
  return <Icon className="w-3.5 h-3.5 shrink-0" />
}

interface IntentHint {
  intent: string
  label: string
  agent: string
}

const PHASE_ICONS: Record<string, React.ReactNode> = {
  requirement:  <FileText className="w-3 h-3" />,
  architecture: <Blocks className="w-3 h-3" />,
  design:       <Palette className="w-3 h-3" />,
  development:  <Code2 className="w-3 h-3" />,
  testing:      <FlaskConical className="w-3 h-3" />,
  deployment:   <Rocket className="w-3 h-3" />,
  monitoring:   <Activity className="w-3 h-3" />,
}

/** Home CTA copy vs NLU-oriented prompt (create_workspace slots). */
const HOME_GUIDE_TEMPLATE_PROMPT_KEY: TranslationKey = 'nlp.homeGuide.template.prompt'

const INTENT_KEYWORDS: { keywords: RegExp; intent: string; label: string; agent: string }[] = [
  { keywords: /创建.{0,4}需求|新需求|新功能|feature|create.*req/i, intent: 'create_requirement', label: '创建需求', agent: 'PM Agent' },
  { keywords: /创建.{0,4}任务|新任务|create.*task/i, intent: 'create_task', label: '创建任务', agent: 'PM Agent' },
  { keywords: /进度|状态|progress|status/i, intent: 'query_progress', label: '查询进度', agent: 'PM Agent' },
  { keywords: /执行.{0,4}任务|run.*task|运行.*任务/i, intent: 'execute_task', label: '执行任务', agent: 'PM Agent' },
  { keywords: /执行.{0,4}阶段|run.*phase|运行.*阶段/i, intent: 'execute_phase', label: '执行阶段', agent: 'PM Agent' },
  { keywords: /运行.{0,4}项目|全部执行|run.*project|full.*lifecycle/i, intent: 'run_project', label: '运行项目', agent: 'PM Agent' },
  { keywords: /需求分析|分析.{0,4}需求|analyze|refine.*req/i, intent: 'analyze_requirements', label: '分析需求', agent: 'PM Agent' },
  { keywords: /架构|architecture|系统设计|tech.*design/i, intent: 'architecture_design', label: '架构设计', agent: 'PM Agent' },
  { keywords: /ui|ux|界面|设计.*页|wireframe|mockup|页面.*设计/i, intent: 'ui_design', label: 'UI 设计', agent: 'PM Agent' },
  { keywords: /代码|编码|开发|generate.*code|implement|coding/i, intent: 'generate_code', label: '生成代码', agent: 'PM Agent' },
  { keywords: /测试|test|qa|质量/i, intent: 'run_tests', label: '运行测试', agent: 'PM Agent' },
  { keywords: /部署|deploy|ci\/cd|发布|release/i, intent: 'deploy', label: '部署', agent: 'PM Agent' },
  { keywords: /监控|monitor|alert|告警|dashboard/i, intent: 'setup_monitoring', label: '配置监控', agent: 'PM Agent' },
]

function predictIntent(text: string): IntentHint | null {
  if (text.length < 2) return null
  for (const rule of INTENT_KEYWORDS) {
    if (rule.keywords.test(text)) {
      return { intent: rule.intent, label: rule.label, agent: rule.agent }
    }
  }
  return null
}

export default function CommandBar({
  embedInPanel = false,
  withThreadAbove = false,
}: {
  embedInPanel?: boolean
  /** When embedded under ConversationThread, flat top + divider; when false, this block is the top of the shell. */
  withThreadAbove?: boolean
}) {
  const [input, setInput] = useState('')
  const [focused, setFocused] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [intentHint, setIntentHint] = useState<IntentHint | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const { activeWorkspaceId, activeRequirementId, workspaces, workspaceDetailReady, sendNLPMessageStream: sendNLPMessage, nlpLoading, homeNlpLoading, sendHomeNLPStream, clearHomeMessages } = useWorkspaceStore()
  const { setHomeSearchQuery, unregisterNlpContext } = useUIStore()
  const activeCtx = useActiveNlpContext()
  const slashCommands = useSlashCommands()
  const t = useT()

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId)

  /**
   * Workspace list rows omit requirements until GET /workspaces/:id; avoid discovery / zero-requirement
   * copy until `workspaceDetailReady` (set when that request finishes for the active id).
   */
  const isZeroRequirements =
    workspaceDetailReady &&
    !!activeWorkspaceId &&
    !!activeWorkspace &&
    (activeWorkspace.requirements?.length ?? 0) === 0
  const activeRequirement = activeWorkspace?.requirements?.find((r) => r.id === activeRequirementId)

  /** Match `WorkspaceHome` NLP strip: max-w-2xl + px-6 sm:px-10 (same in workspace / requirement detail). */
  const barPopOverInset = 'left-0 right-0'

  useEffect(() => {
    setInput('')
    setIntentHint(null)
    if (activeWorkspaceId) {
      clearHomeMessages()
      setHomeSearchQuery('')
    }
  }, [activeWorkspaceId, setHomeSearchQuery, clearHomeMessages])

  // Debounced intent prediction
  useEffect(() => {
    if (!activeWorkspaceId || !focused) {
      setIntentHint(null)
      return
    }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const hint = predictIntent(input)
      setIntentHint(hint)
    }, 200)
    return () => clearTimeout(debounceRef.current)
  }, [input, focused, activeWorkspaceId])

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!activeWorkspaceId || !focused || !input) return []

    const lastWord = input.split(/\s/).pop() || ''

    if (lastWord.startsWith('/')) {
      const q = lastWord.slice(1).toLowerCase()
      return slashCommands
        .filter((c) => !q || c.cmd.slice(1).includes(q) || t(c.labelKey).toLowerCase().includes(q))
        .map((c) => ({
          id: `cmd-${c.cmd}`,
          type: 'command' as const,
          label: t(c.labelKey),
          value: `${c.cmd} `,
          slashCmd: c.cmd,
        }))
    }

    if (input.length >= 2) {
      const q = input.toLowerCase()
      const ws = workspaces.find((w) => w.id === activeWorkspaceId)
      if (!ws) return []
      const tasks: Suggestion[] = []
      ws.phases.forEach((p) => {
        p.tasks.forEach((task) => {
          const shown = translateSeedTaskCopy(task.title, task.description, t)
          if (
            task.title.toLowerCase().includes(q) ||
            shown.title.toLowerCase().includes(q)
          ) {
            tasks.push({
              id: `task-${task.id}`,
              type: 'task',
              label: shown.title,
              value: task.title,
              description: p.name,
            })
          }
        })
      })
      return tasks.slice(0, 5)
    }

    return []
  }, [input, focused, activeWorkspaceId, workspaces, t, slashCommands])

  useEffect(() => {
    setSelectedIdx(0)
  }, [suggestions.length])

  function applySuggestion(sug: Suggestion) {
    if (sug.type === 'agent') {
      const words = input.split(/\s/)
      words[words.length - 1] = sug.value
      setInput(words.join(' '))
    } else if (sug.type === 'command') {
      const words = input.split(/\s/)
      words[words.length - 1] = sug.value
      setInput(words.join(' '))
    } else {
      setInput(sug.value)
    }
    inputRef.current?.focus()
  }

  const handleKeydown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      setInput('')
      inputRef.current?.blur()
      setFocused(false)
      return
    }
    if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA' && !(document.activeElement as HTMLElement)?.isContentEditable) {
      e.preventDefault()
      inputRef.current?.focus()
    }
  }, [])

  useEffect(() => {
    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [handleKeydown])

  function handleInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (suggestions.length > 0) {
        applySuggestion(suggestions[selectedIdx])
      } else {
        doSubmit()
      }
      return
    }
    if (suggestions.length > 0) {
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIdx((i) => (i > 0 ? i - 1 : suggestions.length - 1))
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIdx((i) => (i < suggestions.length - 1 ? i + 1 : 0))
        return
      }
      if (e.key === 'Tab') {
        e.preventDefault()
        applySuggestion(suggestions[selectedIdx])
        return
      }
    }
  }

  function doSubmit() {
    const text = input.trim()
    if (!text || nlpLoading || homeNlpLoading) return

    setIntentHint(null)

    if (!activeWorkspaceId) {
      setInput('')
      sendHomeNLPStream(text)
      return
    }

    if (activeRequirement && (activeRequirement.status === 'draft' || activeRequirement.status === 'designing')) {
      const targetPhase = (activeCtx?.contextPayload?.phase_type as string) || 'requirement'
      const nonRequirementPhases = ['architecture', 'design', 'development', 'testing', 'deployment', 'monitoring']
      const mentionsNonRequirementPhase = nonRequirementPhases.some(phase =>
        text.toLowerCase().includes(phase) ||
        text.toLowerCase().includes(t(`requirement.phase.${phase}` as TranslationKey).toLowerCase())
      )
      if (mentionsNonRequirementPhase && targetPhase !== 'requirement') {
        alert(t('requirement.notReadyAlert' as TranslationKey))
        setInput('')
        return
      }
    }

    sendNLPMessage(text)
    setInput('')
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    doSubmit()
  }

  function handleHomeGuideChip(prompt: string) {
    if (nlpLoading || homeNlpLoading) return
    setInput('')
    setIntentHint(null)
    sendHomeNLPStream(prompt)
  }

  const typeIcon = (type: Suggestion['type']) => {
    switch (type) {
      case 'agent': return <Bot className="w-3.5 h-3.5" />
      case 'command': return <Slash className="w-3.5 h-3.5" />
      case 'task': return <CheckSquare className="w-3.5 h-3.5" />
    }
  }

  const showSuggestions = focused && suggestions.length > 0
  const showIntentHint = focused && intentHint && !showSuggestions && input.trim().length >= 3

  const ctxAgentLabel = activeCtx?.agentLabel || t('agent.name.pm')
  const ctxIcon = activeCtx?.icon ? PHASE_ICONS[activeCtx.icon] : null

  const getPlaceholder = () => {
    if (activeCtx?.placeholderKey) return t(activeCtx.placeholderKey)
    if (!activeWorkspaceId) return t('command.placeholderHome')
    if (activeWorkspaceId && !workspaceDetailReady) return t('command.placeholderNLP')
    if (isZeroRequirements) return t('command.placeholderDiscovery' as TranslationKey)
    if (activeRequirement && (activeRequirement.status === 'draft' || activeRequirement.status === 'designing')) {
      return t('requirement.designModeHint' as TranslationKey)
    }
    if (activeRequirement && (activeRequirement.status === 'ready' || activeRequirement.status === 'in_progress' || activeRequirement.status === 'completed')) {
      return t('requirement.executeModeHint' as TranslationKey)
    }
    if (activeCtx) {
      return `${t('command.contextPlaceholder' as TranslationKey)} ${ctxAgentLabel}…`
    }
    return t('command.placeholderNLP')
  }

  const placeholder = getPlaceholder()

  const formShell = embedInPanel
    ? withThreadAbove
      ? `w-full mb-0 flex items-center gap-3 px-4 h-12 rounded-none border-0 border-t border-border-subtle/35 transition-all duration-300 ${
          focused
            ? 'border-accent/30 bg-surface-2/50 shadow-none'
            : 'border-border-subtle/35 bg-surface-2/30 hover:bg-surface-2/40'
        }`
      : `w-full mb-0 flex items-center gap-3 px-4 h-12 rounded-2xl border transition-all duration-300 ${
          focused
            ? 'border-accent/40 bg-surface-2/50 shadow-[0_0_30px_rgba(99,102,241,0.08)]'
            : 'border-border-subtle bg-surface-2/40 hover:border-border-default'
        }`
    : null

  return (
    <div
      className={
        embedInPanel
          ? 'relative z-auto w-full'
          : 'relative z-[55] w-full max-w-2xl mx-auto'
      }
    >
      {/* Suggestion dropdown (above input) */}
      <AnimatePresence>
        {showSuggestions && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.12 }}
            className={`absolute bottom-full mb-1 rounded-xl border border-border-default bg-surface-1 shadow-xl shadow-black/20 overflow-hidden ${barPopOverInset}`}
          >
            <div className="px-3 py-1.5 border-b border-border-subtle">
              <span className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">
                {suggestions[0]?.type === 'agent' ? t('suggest.agents') : suggestions[0]?.type === 'command' ? t('suggest.commands') : t('suggest.tasks')}
              </span>
            </div>
            <div className="py-1 max-h-48 overflow-y-auto">
              {suggestions.map((sug, i) => (
                <button
                  key={sug.id}
                  onMouseDown={(e) => { e.preventDefault(); applySuggestion(sug) }}
                  onMouseEnter={() => setSelectedIdx(i)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left cursor-pointer transition-colors ${
                    i === selectedIdx ? 'bg-accent/10 text-accent' : 'text-text-secondary hover:bg-surface-2'
                  }`}
                >
                  <span className={i === selectedIdx ? 'text-accent' : 'text-text-tertiary'}>
                    {sug.type === 'command' && sug.slashCmd ? (
                      <SlashCommandSuggestIcon cmd={sug.slashCmd} />
                    ) : (
                      typeIcon(sug.type)
                    )}
                  </span>
                  <span className="text-xs font-medium flex-1 truncate">{sug.label}</span>
                  {sug.description && sug.type !== 'command' && (
                    <span className="text-[10px] text-text-tertiary/90 truncate max-w-[100px]">{sug.description}</span>
                  )}
                  <kbd className="text-[9px] text-text-tertiary/50 font-mono">Tab</kbd>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Intent prediction hint (above input, when no suggestions) */}
      <AnimatePresence>
        {showIntentHint && (
          <motion.div
            initial={{ opacity: 0, y: 4, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: 4, height: 0 }}
            transition={{ duration: 0.15 }}
            className={`absolute bottom-full mb-1 overflow-hidden ${barPopOverInset}`}
          >
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-2/90 border border-accent/15 backdrop-blur-sm">
              <Target className="w-3 h-3 text-accent/60 shrink-0" />
              <span className="text-[10px] text-text-tertiary">
                {t('nlp.intentPredict' as TranslationKey)}
              </span>
              <span className="text-[10px] font-medium text-accent">{intentHint.label}</span>
              <ChevronRight className="w-2.5 h-2.5 text-text-tertiary/40" />
              <span className="text-[10px] text-text-tertiary">
                <Bot className="w-2.5 h-2.5 inline -mt-0.5 mr-0.5" />
                {intentHint.agent}
              </span>
              <span className="flex-1" />
              <kbd className="text-[9px] text-text-tertiary/40 font-mono">Enter ↵</kbd>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Context pill (above form, when a view-specific context is active) */}
      <AnimatePresence>
        {activeCtx && activeWorkspaceId && (
          <motion.div
            initial={{ opacity: 0, y: 6, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: 6, height: 0 }}
            transition={{ duration: 0.18 }}
            className="mb-1 overflow-hidden"
          >
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-2/80 border border-border-subtle backdrop-blur-sm">
              <FileText className="w-3 h-3 text-text-tertiary shrink-0" />
              <span className="text-[10px] text-text-tertiary truncate max-w-[140px]">
                {activeCtx.label}
              </span>
              {activeCtx.sublabel && (
                <>
                  <ChevronRight className="w-2.5 h-2.5 text-text-tertiary/50 shrink-0" />
                  <span className="flex items-center gap-1 text-[10px] text-accent font-medium">
                    {ctxIcon}
                    {activeCtx.sublabel}
                  </span>
                </>
              )}
              <div className="flex-1" />
              {activeCtx.agentType && (
                <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-accent/10 border border-accent/20">
                  <Bot className="w-2.5 h-2.5 text-accent" />
                  <span className="text-[10px] font-medium text-accent">{ctxAgentLabel}</span>
                </div>
              )}
              <button
                onClick={() => unregisterNlpContext(activeCtx.id)}
                className="p-0.5 rounded text-text-tertiary/50 hover:text-text-secondary hover:bg-surface-3 transition-colors cursor-pointer"
                title={t('nlp.clearContext' as TranslationKey)}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <form
        onSubmit={handleSubmit}
        className={
          formShell ??
          `
          w-full mb-3 flex items-center gap-3 px-4 h-12 rounded-2xl border transition-all duration-300
          ${
            focused
              ? 'border-accent/40 bg-surface-2 shadow-[0_0_30px_rgba(99,102,241,0.08)]'
              : 'border-border-default bg-surface-1 hover:border-border-strong'
          }
        `
        }
      >
        <Sparkles className={`w-4 h-4 shrink-0 transition-colors ${focused ? 'text-accent' : 'text-text-tertiary'}`} />

        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onKeyDown={handleInputKeyDown}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary outline-none"
        />

        {input.trim() ? (
          <motion.button
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            type="button"
            onClick={() => doSubmit()}
            disabled={nlpLoading || homeNlpLoading}
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
              nlpLoading || homeNlpLoading ? 'bg-accent/50 cursor-not-allowed' : 'bg-accent hover:bg-accent-hover'
            }`}
          >
            {nlpLoading || homeNlpLoading ? (
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <ArrowUp className="w-4 h-4 text-white" />
            )}
          </motion.button>
        ) : (
          <kbd className="hidden sm:flex items-center gap-0.5 text-[10px] text-text-tertiary bg-surface-3 px-1.5 py-0.5 rounded-md border border-border-subtle font-mono">
            <Command className="w-2.5 h-2.5" />K
          </kbd>
        )}
      </form>

      {!activeWorkspaceId && (
        <div
          className={
            embedInPanel
              ? 'mt-1.5 flex justify-center sm:justify-start px-1 pb-0 sm:px-0.5'
              : 'mt-2 flex justify-center sm:justify-start px-0.5'
          }
        >
          <button
            type="button"
            disabled={nlpLoading || homeNlpLoading}
            onClick={() => handleHomeGuideChip(t(HOME_GUIDE_TEMPLATE_PROMPT_KEY))}
            className="max-w-full text-left text-[11px] leading-relaxed text-text-secondary hover:text-accent underline decoration-text-tertiary/40 underline-offset-2 hover:decoration-accent/50 transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed disabled:no-underline"
          >
            {t('nlp.homeGuide.tagline' as TranslationKey)}
          </button>
        </div>
      )}
    </div>
  )
}
