import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles, ArrowUp, Command, Bot, Slash, CheckSquare,
  FileText, Blocks, Palette, Code2, FlaskConical, Rocket, Activity,
  X, ChevronRight, Loader2, Target,
} from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspace'
import { useUIStore } from '../stores/ui'
import { useT } from '../i18n'
import type { TranslationKey } from '../i18n/en'
import { translateSeedTaskCopy } from '../lib/seedTaskI18n'
import type { Agent } from '../types'

interface Suggestion {
  id: string
  type: 'agent' | 'command' | 'task'
  label: string
  value: string
  description?: string
}

interface IntentHint {
  intent: string
  label: string
  agent: string
}

const AGENT_SUGGESTIONS: { name: string; key: TranslationKey }[] = [
  { name: 'pm', key: 'agent.name.pm' },
  { name: 'requirement', key: 'agent.name.requirement' },
  { name: 'design', key: 'agent.name.design' },
  { name: 'architecture', key: 'agent.name.architecture' },
  { name: 'development', key: 'agent.name.development' },
  { name: 'testing', key: 'agent.name.testing' },
  { name: 'cicd', key: 'agent.name.cicd' },
  { name: 'monitoring', key: 'agent.name.monitoring' },
]

const COMMAND_SUGGESTIONS: { cmd: string; key: TranslationKey }[] = [
  { cmd: '/create', key: 'cmd.createTask' },
  { cmd: '/status', key: 'cmd.changeStatus' },
  { cmd: '/assign', key: 'cmd.assign' },
  { cmd: '/deploy', key: 'cmd.deploy' },
  { cmd: '/review', key: 'cmd.review' },
  { cmd: '/report', key: 'cmd.report' },
]

const PHASE_ICONS: Record<string, React.ReactNode> = {
  requirement:  <FileText className="w-3 h-3" />,
  architecture: <Blocks className="w-3 h-3" />,
  design:       <Palette className="w-3 h-3" />,
  development:  <Code2 className="w-3 h-3" />,
  testing:      <FlaskConical className="w-3 h-3" />,
  deployment:   <Rocket className="w-3 h-3" />,
  monitoring:   <Activity className="w-3 h-3" />,
}

const AGENT_LABEL_KEY: Record<string, TranslationKey> = {
  requirement:  'agent.name.requirement',
  architecture: 'agent.name.architecture',
  design:       'agent.name.design',
  development:  'agent.name.development',
  testing:      'agent.name.testing',
  cicd:         'agent.name.cicd',
  monitoring:   'agent.name.monitoring',
  pm:           'agent.name.pm',
}

const PHASE_CONTEXT_LABEL: Record<string, TranslationKey> = {
  requirement:  'requirement.phase.requirement',
  architecture: 'requirement.phase.architecture',
  design:       'requirement.phase.design',
  development:  'requirement.phase.development',
  testing:      'requirement.phase.testing',
  deployment:   'requirement.phase.deployment',
  monitoring:   'requirement.phase.monitoring',
}

const INTENT_KEYWORDS: { keywords: RegExp; intent: string; label: string; agent: string }[] = [
  { keywords: /创建.{0,4}需求|新需求|新功能|feature|create.*req/i, intent: 'create_requirement', label: '创建需求', agent: 'PM Agent' },
  { keywords: /创建.{0,4}任务|新任务|create.*task/i, intent: 'create_task', label: '创建任务', agent: 'PM Agent' },
  { keywords: /进度|状态|progress|status/i, intent: 'query_progress', label: '查询进度', agent: 'PM Agent' },
  { keywords: /执行.{0,4}任务|run.*task|运行.*任务/i, intent: 'execute_task', label: '执行任务', agent: 'PM Agent' },
  { keywords: /执行.{0,4}阶段|run.*phase|运行.*阶段/i, intent: 'execute_phase', label: '执行阶段', agent: 'PM Agent' },
  { keywords: /运行.{0,4}项目|全部执行|run.*project|full.*lifecycle/i, intent: 'run_project', label: '运行项目', agent: 'PM Agent' },
  { keywords: /需求分析|分析.{0,4}需求|analyze|refine.*req/i, intent: 'analyze_requirements', label: '分析需求', agent: '需求 Agent' },
  { keywords: /架构|architecture|系统设计|tech.*design/i, intent: 'architecture_design', label: '架构设计', agent: '架构 Agent' },
  { keywords: /ui|ux|界面|设计.*页|wireframe|mockup|页面.*设计/i, intent: 'ui_design', label: 'UI 设计', agent: '设计 Agent' },
  { keywords: /代码|编码|开发|generate.*code|implement|coding/i, intent: 'generate_code', label: '生成代码', agent: '开发 Agent' },
  { keywords: /测试|test|qa|质量/i, intent: 'run_tests', label: '运行测试', agent: '测试 Agent' },
  { keywords: /部署|deploy|ci\/cd|发布|release/i, intent: 'deploy', label: '部署', agent: 'CI/CD Agent' },
  { keywords: /监控|monitor|alert|告警|dashboard/i, intent: 'setup_monitoring', label: '配置监控', agent: '监控 Agent' },
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

function AgentActivityIndicator({
  agents,
  t,
  popoverInset,
}: {
  agents: Agent[]
  t: (key: TranslationKey) => string
  popoverInset: string
}) {
  const runningAgents = agents.filter((a) => a.status === 'running')
  if (runningAgents.length === 0) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      className={`absolute bottom-full mb-1 ${popoverInset}`}
    >
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/10 border border-accent/20 backdrop-blur-sm">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
        </span>
        <Loader2 className="w-3 h-3 text-accent animate-spin" />
        <span className="text-[11px] text-accent font-medium">
          {runningAgents.length === 1
            ? `${t(`agent.name.${runningAgents[0].type}` as TranslationKey)} ${t('agent.status.running')}`
            : `${runningAgents.length} ${t('agent.active')} ${t('agent.status.running')}`}
        </span>
        {runningAgents[0]?.currentTask && (
          <span className="text-[10px] text-text-tertiary truncate max-w-[200px]">
            · {runningAgents[0].currentTask}
          </span>
        )}
      </div>
    </motion.div>
  )
}

export default function CommandBar() {
  const [input, setInput] = useState('')
  const [focused, setFocused] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [intentHint, setIntentHint] = useState<IntentHint | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const { activeWorkspaceId, activeRequirementId, workspaces, sendNLPMessageStream: sendNLPMessage, nlpLoading, homeNlpLoading, sendHomeNLPStream, clearHomeMessages } = useWorkspaceStore()
  const { setHomeSearchQuery, nlpContext, setNlpContext } = useUIStore()
  const t = useT()

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId)
  const workspaceAgents = activeWorkspace?.agents || []

  const isZeroRequirements = !!activeWorkspaceId && (activeWorkspace?.requirements?.length ?? 0) === 0
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

    if (lastWord.startsWith('@')) {
      const q = lastWord.slice(1).toLowerCase()
      return AGENT_SUGGESTIONS
        .filter((a) => !q || a.name.includes(q) || t(a.key).toLowerCase().includes(q))
        .map((a) => ({
          id: `agent-${a.name}`,
          type: 'agent' as const,
          label: t(a.key),
          value: `@${a.name} `,
          description: a.name,
        }))
    }

    if (lastWord.startsWith('/')) {
      const q = lastWord.slice(1).toLowerCase()
      return COMMAND_SUGGESTIONS
        .filter((c) => !q || c.cmd.slice(1).includes(q) || t(c.key).toLowerCase().includes(q))
        .map((c) => ({
          id: `cmd-${c.cmd}`,
          type: 'command' as const,
          label: t(c.key),
          value: `${c.cmd} `,
          description: c.cmd,
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
  }, [input, focused, activeWorkspaceId, workspaces, t])

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
      const targetPhase = nlpContext?.phaseType || 'requirement'
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

  const typeIcon = (type: Suggestion['type']) => {
    switch (type) {
      case 'agent': return <Bot className="w-3.5 h-3.5" />
      case 'command': return <Slash className="w-3.5 h-3.5" />
      case 'task': return <CheckSquare className="w-3.5 h-3.5" />
    }
  }

  const showSuggestions = focused && suggestions.length > 0
  const showIntentHint = focused && intentHint && !showSuggestions && input.trim().length >= 3
  const hasRunningAgents = workspaceAgents.some((a) => a.status === 'running')

  const agentKey = nlpContext?.agentType ? (AGENT_LABEL_KEY[nlpContext.agentType] || 'agent.name.pm') : 'agent.name.pm'
  const agentLabel = t(agentKey)
  const phaseIcon = nlpContext?.phaseType ? PHASE_ICONS[nlpContext.phaseType] : null
  const phaseLabel =
    nlpContext?.phaseType && PHASE_CONTEXT_LABEL[nlpContext.phaseType]
      ? t(PHASE_CONTEXT_LABEL[nlpContext.phaseType])
      : nlpContext?.phaseType ?? null

  const getPlaceholder = () => {
    if (!activeWorkspaceId) return t('command.placeholderHome')
    if (isZeroRequirements) return t('command.placeholderDiscovery' as TranslationKey)
    if (activeRequirement && (activeRequirement.status === 'draft' || activeRequirement.status === 'designing')) {
      return t('requirement.designModeHint' as TranslationKey)
    }
    if (activeRequirement && (activeRequirement.status === 'ready' || activeRequirement.status === 'in_progress' || activeRequirement.status === 'completed')) {
      return t('requirement.executeModeHint' as TranslationKey)
    }
    if (nlpContext) {
      return `${t('command.contextPlaceholder' as TranslationKey)} ${agentLabel}…`
    }
    return t('command.placeholderNLP')
  }

  const placeholder = getPlaceholder()

  return (
    <div className="relative z-[55] w-full max-w-2xl mx-auto px-6 sm:px-10">
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
                    {typeIcon(sug.type)}
                  </span>
                  <span className="text-xs font-medium flex-1 truncate">{sug.label}</span>
                  {sug.description && (
                    <span className="text-[10px] font-mono text-text-tertiary">{sug.description}</span>
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

      {/* Context pill (above form, when in requirement detail) */}
      <AnimatePresence>
        {nlpContext && activeWorkspaceId && (
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
                {nlpContext.requirementTitle}
              </span>
              {nlpContext.phaseType && (
                <>
                  <ChevronRight className="w-2.5 h-2.5 text-text-tertiary/50 shrink-0" />
                  <span className="flex items-center gap-1 text-[10px] text-accent font-medium">
                    {phaseIcon}
                    {phaseLabel}
                  </span>
                </>
              )}
              <div className="flex-1" />
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-accent/10 border border-accent/20">
                <Bot className="w-2.5 h-2.5 text-accent" />
                <span className="text-[10px] font-medium text-accent">{agentLabel}</span>
              </div>
              <button
                onClick={() => setNlpContext(null)}
                className="p-0.5 rounded text-text-tertiary/50 hover:text-text-secondary hover:bg-surface-3 transition-colors cursor-pointer"
                title={t('nlp.clearContext' as TranslationKey)}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Agent activity indicator */}
      <AnimatePresence>
        {hasRunningAgents && (
          <AgentActivityIndicator agents={workspaceAgents} t={t} popoverInset={barPopOverInset} />
        )}
      </AnimatePresence>

      <form
        onSubmit={handleSubmit}
        className={`
          w-full mb-3 flex items-center gap-3 px-4 h-12 rounded-2xl border transition-all duration-300
          ${
            focused
              ? 'border-accent/40 bg-surface-2 shadow-[0_0_30px_rgba(99,102,241,0.08)]'
              : 'border-border-default bg-surface-1 hover:border-border-strong'
          }
        `}
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
    </div>
  )
}
