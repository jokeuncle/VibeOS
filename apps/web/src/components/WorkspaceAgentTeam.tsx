import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Bot, Settings2, ChevronDown, ChevronUp,
  Cpu, Wrench, MessageSquare, ToggleLeft, ToggleRight,
  Sparkles, Code2, TestTube, Rocket, Eye, Brush, ClipboardList,
  Circle,
} from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspace'
import { workspaceApi } from '../lib/api'
import { useT } from '../i18n'
import type { TranslationKey } from '../i18n/en'
import type { AgentStatus } from '../types'
import { useRegisterNlpContext } from '../hooks/useNlpContext'
import type { NlpContextDescriptor } from '../lib/nlpContext'

interface AgentMeta {
  type: string
  label: string
  descKey: TranslationKey
  promptHintKey: TranslationKey
  icon: typeof Bot
  iconColor: string
  ringColor: string
  defaultModel: string
  tools: string[]
}

const AGENT_META: AgentMeta[] = [
  {
    type: 'pm',
    label: 'PM Agent',
    descKey: 'agentTeam.agent.pm.desc',
    promptHintKey: 'agentTeam.agent.pm.promptHint',
    icon: Sparkles,
    iconColor: 'text-violet-400',
    ringColor: 'border-violet-500/30 bg-violet-500/6',
    defaultModel: 'claude-opus-4-5',
    tools: ['intent_classify', 'workflow_dispatch', 'delegate_to_agent'],
  },
  {
    type: 'requirement',
    label: 'Requirement Agent',
    descKey: 'agentTeam.agent.requirement.desc',
    promptHintKey: 'agentTeam.agent.requirement.promptHint',
    icon: ClipboardList,
    iconColor: 'text-blue-400',
    ringColor: 'border-blue-500/30 bg-blue-500/6',
    defaultModel: 'claude-sonnet-4-5',
    tools: ['analyze_requirements', 'generate_user_stories', 'create_acceptance_criteria'],
  },
  {
    type: 'architecture',
    label: 'Architecture Agent',
    descKey: 'agentTeam.agent.architecture.desc',
    promptHintKey: 'agentTeam.agent.architecture.promptHint',
    icon: Cpu,
    iconColor: 'text-indigo-400',
    ringColor: 'border-indigo-500/30 bg-indigo-500/6',
    defaultModel: 'claude-opus-4-5',
    tools: ['generate_schema', 'design_api', 'evaluate_tech_stack'],
  },
  {
    type: 'design',
    label: 'Design Agent',
    descKey: 'agentTeam.agent.design.desc',
    promptHintKey: 'agentTeam.agent.design.promptHint',
    icon: Brush,
    iconColor: 'text-pink-400',
    ringColor: 'border-pink-500/30 bg-pink-500/6',
    defaultModel: 'claude-sonnet-4-5',
    tools: ['design_component', 'create_wireframe', 'define_style_guide'],
  },
  {
    type: 'development',
    label: 'Dev Agent',
    descKey: 'agentTeam.agent.development.desc',
    promptHintKey: 'agentTeam.agent.development.promptHint',
    icon: Code2,
    iconColor: 'text-emerald-400',
    ringColor: 'border-emerald-500/30 bg-emerald-500/6',
    defaultModel: 'gemini-2.5-pro',
    tools: ['generate_code', 'gitlab_push_file', 'gitlab_create_mr', 'review_code'],
  },
  {
    type: 'testing',
    label: 'Test Agent',
    descKey: 'agentTeam.agent.testing.desc',
    promptHintKey: 'agentTeam.agent.testing.promptHint',
    icon: TestTube,
    iconColor: 'text-yellow-400',
    ringColor: 'border-yellow-500/30 bg-yellow-500/6',
    defaultModel: 'claude-sonnet-4-5',
    tools: ['generate_test_plan', 'create_test_cases', 'analyze_coverage'],
  },
  {
    type: 'cicd',
    label: 'CI/CD Agent',
    descKey: 'agentTeam.agent.cicd.desc',
    promptHintKey: 'agentTeam.agent.cicd.promptHint',
    icon: Rocket,
    iconColor: 'text-orange-400',
    ringColor: 'border-orange-500/30 bg-orange-500/6',
    defaultModel: 'claude-sonnet-4-5',
    tools: ['design_pipeline', 'create_deployment_config', 'gitlab_create_pipeline'],
  },
  {
    type: 'monitoring',
    label: 'Monitoring Agent',
    descKey: 'agentTeam.agent.monitoring.desc',
    promptHintKey: 'agentTeam.agent.monitoring.promptHint',
    icon: Eye,
    iconColor: 'text-cyan-400',
    ringColor: 'border-cyan-500/30 bg-cyan-500/6',
    defaultModel: 'claude-sonnet-4-5',
    tools: ['design_monitoring', 'create_alerts', 'create_runbook'],
  },
]

const MODEL_OPTIONS = [
  'claude-opus-4-5',
  'claude-sonnet-4-5',
  'claude-haiku-4-5',
  'gemini-2.5-pro',
  'gemini-2.0-flash',
  'gpt-4o',
]

function statusDot(status: AgentStatus) {
  const map: Record<AgentStatus, string> = {
    running: 'bg-accent animate-pulse',
    waiting: 'bg-warning',
    error:   'bg-danger',
    idle:    'bg-surface-4',
  }
  return map[status] ?? 'bg-surface-4'
}

function AgentCard({
  meta,
  liveStatus,
  liveModel,
  agentId,
  wsId,
}: {
  meta: AgentMeta
  liveStatus: AgentStatus
  liveModel?: string
  agentId?: string
  wsId: string
}) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)
  const [model, setModel] = useState(liveModel ?? meta.defaultModel)
  const Icon = meta.icon

  // Sync model when backend data loads or workspace switches
  useEffect(() => {
    if (liveModel) setModel(liveModel)
  }, [liveModel])

  const isActive = liveStatus !== 'idle'

  async function handleModelChange(newModel: string) {
    setModel(newModel)
    if (!agentId) return
    await workspaceApi.updateAgent(wsId, agentId, { preferredModel: newModel }).catch(() => {})
  }

  async function handleToggle() {
    if (!agentId) return
    const newStatus = liveStatus === 'idle' ? 'waiting' : 'idle'
    await workspaceApi.updateAgent(wsId, agentId, { status: newStatus }).catch(() => {})
  }

  return (
    <motion.div
      layout
      className={`rounded-xl border transition-all ${isActive ? meta.ringColor : 'border-border-subtle bg-surface-1/20'}`}
    >
      <div className="flex items-start gap-3 p-4">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isActive ? 'bg-surface-3' : 'bg-surface-2'}`}>
          <Icon className={`w-4 h-4 ${isActive ? meta.iconColor : 'text-text-tertiary'}`} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`text-[12px] font-semibold ${isActive ? 'text-text-primary' : 'text-text-tertiary'}`}>
              {meta.label}
            </span>
            <span className="text-[10px] font-mono text-text-tertiary bg-surface-3 px-1.5 py-0.5 rounded-md">
              {model}
            </span>
            <div className="flex items-center gap-1 ml-auto shrink-0">
              <div className={`w-1.5 h-1.5 rounded-full ${statusDot(liveStatus)}`} />
              <span className="text-[10px] text-text-tertiary capitalize">{liveStatus}</span>
            </div>
          </div>
          <p className="text-[11px] text-text-tertiary leading-relaxed">{t(meta.descKey)}</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button onClick={handleToggle} className="cursor-pointer" disabled={!agentId}>
            {isActive
              ? <ToggleRight className="w-5 h-5 text-accent" />
              : <ToggleLeft className="w-5 h-5 text-text-tertiary" />
            }
          </button>
          <button
            onClick={() => setExpanded(v => !v)}
            className="w-6 h-6 flex items-center justify-center text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {expanded && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="px-4 pb-4 space-y-4 border-t border-border-subtle pt-4"
        >
          <div>
            <label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary mb-2">
              <Cpu className="w-3 h-3" />
              {t('agentTeam.field.model')}
            </label>
            <select
              value={model}
              onChange={e => handleModelChange(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface-3 border border-border-default text-[12px] text-text-primary focus:outline-none focus:border-accent/50 cursor-pointer transition-colors appearance-none"
            >
              {MODEL_OPTIONS.map(m => (
                <option key={m} value={m} className="bg-surface-3">{m}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary mb-2">
              <Wrench className="w-3 h-3" />
              {t('agentTeam.field.tools')}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {meta.tools.map(tool => (
                <span
                  key={tool}
                  className="text-[10px] font-mono px-2 py-1 rounded-md bg-surface-3 border border-border-subtle text-text-secondary"
                >
                  {tool}
                </span>
              ))}
            </div>
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary mb-2">
              <MessageSquare className="w-3 h-3" />
              {t('agentTeam.field.systemPrompt')}
            </label>
            <p className="text-[11px] text-text-tertiary italic">{t('agentTeam.field.systemPromptHint')}</p>
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}

export default function WorkspaceAgentTeam() {
  const t = useT()
  const { workspaces, activeWorkspaceId } = useWorkspaceStore()
  const workspace = workspaces.find(w => w.id === activeWorkspaceId)
  const liveAgents = workspace?.agents ?? []

  const activeCount = liveAgents.filter(a => a.status !== 'idle').length

  const nlpDesc: NlpContextDescriptor | null = activeWorkspaceId ? {
    id: 'view:agent_team',
    type: 'agent_team',
    priority: 15,
    label: t('sidebar.agentTeam' as TranslationKey),
    agentType: 'pm',
    agentLabel: t('agent.name.pm'),
    contextPayload: { view: 'agent_team' },
    placeholderKey: 'command.placeholderNLP',
    intentHints: ['query_progress'],
  } : null
  useRegisterNlpContext(nlpDesc)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-6"
    >
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Bot className="w-4 h-4 text-accent" />
          <h1 className="text-base font-semibold text-text-primary tracking-tight">{t('agentTeam.title')}</h1>
          <span className="ml-auto text-[11px] font-mono text-text-tertiary">
            {activeCount}/{AGENT_META.length} {t('agentTeam.active')}
          </span>
        </div>
        <p className="text-[12px] text-text-tertiary">{t('agentTeam.desc')}</p>
      </div>

      <div className="rounded-xl border border-border-subtle bg-surface-1/30 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Settings2 className="w-3.5 h-3.5 text-text-tertiary" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">
            {t('agentTeam.roster')}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {AGENT_META.map(meta => {
            const live = liveAgents.find(a => a.type === meta.type)
            const isActive = live ? live.status !== 'idle' : false
            const Icon = meta.icon
            return (
              <div
                key={meta.type}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-all
                  ${isActive ? `${meta.ringColor} ${meta.iconColor}` : 'border-border-subtle bg-surface-2/40 text-text-tertiary opacity-50'}`}
              >
                <Icon className="w-3 h-3" />
                {meta.label}
                {live && live.status !== 'idle' && (
                  <div className={`w-1 h-1 rounded-full ${statusDot(live.status)}`} />
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="space-y-2">
        {AGENT_META.map(meta => {
          const live = liveAgents.find(a => a.type === meta.type)
          return (
            <AgentCard
              key={meta.type}
              meta={meta}
              liveStatus={live?.status ?? 'idle'}
              liveModel={live?.preferredModel}
              agentId={live?.id}
              wsId={activeWorkspaceId ?? ''}
            />
          )
        })}
      </div>
    </motion.div>
  )
}
