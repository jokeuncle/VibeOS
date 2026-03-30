import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Bot, Settings2, ChevronDown, ChevronUp,
  Cpu, Wrench, MessageSquare, ToggleLeft, ToggleRight,
  Sparkles, Code2, TestTube, Rocket, Eye, Brush, ClipboardList,
} from 'lucide-react'
import { useT } from '../i18n'
import type { TranslationKey } from '../i18n/en'

interface AgentDef {
  type: string
  label: string
  descKey: TranslationKey
  promptHintKey: TranslationKey
  icon: typeof Bot
  iconColor: string
  ringColor: string
  model: string
  enabled: boolean
  tools: string[]
  systemPromptHint: string
}

const AGENT_DEFS_BASE = [
  {
    type: 'pm',
    label: 'PM Agent',
    descKey: 'agentTeam.agent.pm.desc' as TranslationKey,
    promptHintKey: 'agentTeam.agent.pm.promptHint' as TranslationKey,
    icon: Sparkles,
    iconColor: 'text-violet-400',
    ringColor: 'border-violet-500/30 bg-violet-500/6',
    model: 'claude-opus-4-5',
    enabled: true,
    tools: ['intent_classify', 'workflow_dispatch', 'delegate_to_agent'],
  },
  {
    type: 'requirement',
    label: 'Requirement Agent',
    descKey: 'agentTeam.agent.requirement.desc' as TranslationKey,
    promptHintKey: 'agentTeam.agent.requirement.promptHint' as TranslationKey,
    icon: ClipboardList,
    iconColor: 'text-blue-400',
    ringColor: 'border-blue-500/30 bg-blue-500/6',
    model: 'claude-sonnet-4-5',
    enabled: true,
    tools: ['analyze_requirements', 'generate_user_stories', 'create_acceptance_criteria'],
  },
  {
    type: 'architecture',
    label: 'Architecture Agent',
    descKey: 'agentTeam.agent.architecture.desc' as TranslationKey,
    promptHintKey: 'agentTeam.agent.architecture.promptHint' as TranslationKey,
    icon: Cpu,
    iconColor: 'text-indigo-400',
    ringColor: 'border-indigo-500/30 bg-indigo-500/6',
    model: 'claude-opus-4-5',
    enabled: true,
    tools: ['generate_schema', 'design_api', 'evaluate_tech_stack'],
  },
  {
    type: 'design',
    label: 'Design Agent',
    descKey: 'agentTeam.agent.design.desc' as TranslationKey,
    promptHintKey: 'agentTeam.agent.design.promptHint' as TranslationKey,
    icon: Brush,
    iconColor: 'text-pink-400',
    ringColor: 'border-pink-500/30 bg-pink-500/6',
    model: 'claude-sonnet-4-5',
    enabled: true,
    tools: ['design_component', 'create_wireframe', 'define_style_guide'],
  },
  {
    type: 'development',
    label: 'Dev Agent',
    descKey: 'agentTeam.agent.development.desc' as TranslationKey,
    promptHintKey: 'agentTeam.agent.development.promptHint' as TranslationKey,
    icon: Code2,
    iconColor: 'text-emerald-400',
    ringColor: 'border-emerald-500/30 bg-emerald-500/6',
    model: 'gemini-2.5-pro',
    enabled: true,
    tools: ['generate_code', 'gitlab_push_file', 'gitlab_create_mr', 'review_code'],
  },
  {
    type: 'testing',
    label: 'Test Agent',
    descKey: 'agentTeam.agent.testing.desc' as TranslationKey,
    promptHintKey: 'agentTeam.agent.testing.promptHint' as TranslationKey,
    icon: TestTube,
    iconColor: 'text-yellow-400',
    ringColor: 'border-yellow-500/30 bg-yellow-500/6',
    model: 'claude-sonnet-4-5',
    enabled: true,
    tools: ['generate_test_plan', 'create_test_cases', 'analyze_coverage'],
  },
  {
    type: 'cicd',
    label: 'CI/CD Agent',
    descKey: 'agentTeam.agent.cicd.desc' as TranslationKey,
    promptHintKey: 'agentTeam.agent.cicd.promptHint' as TranslationKey,
    icon: Rocket,
    iconColor: 'text-orange-400',
    ringColor: 'border-orange-500/30 bg-orange-500/6',
    model: 'claude-sonnet-4-5',
    enabled: true,
    tools: ['design_pipeline', 'create_deployment_config', 'gitlab_create_pipeline'],
  },
  {
    type: 'monitoring',
    label: 'Monitoring Agent',
    descKey: 'agentTeam.agent.monitoring.desc' as TranslationKey,
    promptHintKey: 'agentTeam.agent.monitoring.promptHint' as TranslationKey,
    icon: Eye,
    iconColor: 'text-cyan-400',
    ringColor: 'border-cyan-500/30 bg-cyan-500/6',
    model: 'claude-sonnet-4-5',
    enabled: false,
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

function AgentCard({ agent, onUpdate }: { agent: AgentDef; onUpdate: (patch: Partial<AgentDef>) => void }) {
  const [expanded, setExpanded] = useState(false)
  const t = useT()
  const Icon = agent.icon

  return (
    <motion.div
      layout
      className={`rounded-xl border transition-all ${agent.enabled ? agent.ringColor : 'border-border-subtle bg-surface-1/20'}`}
    >
      <div className="flex items-start gap-3 p-4">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0
          ${agent.enabled ? 'bg-surface-3' : 'bg-surface-2'}`}
        >
          <Icon className={`w-4 h-4 ${agent.enabled ? agent.iconColor : 'text-text-tertiary'}`} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`text-[12px] font-semibold ${agent.enabled ? 'text-text-primary' : 'text-text-tertiary'}`}>
              {agent.label}
            </span>
            <span className="text-[10px] font-mono text-text-tertiary bg-surface-3 px-1.5 py-0.5 rounded-md">
              {agent.model}
            </span>
          </div>
          <p className="text-[11px] text-text-tertiary leading-relaxed">{t(agent.descKey)}</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onUpdate({ enabled: !agent.enabled })}
            className="cursor-pointer"
          >
            {agent.enabled
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
              value={agent.model}
              onChange={e => onUpdate({ model: e.target.value })}
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
              {agent.tools.map(tool => (
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
            <textarea
              value={agent.systemPromptHint}
              onChange={e => onUpdate({ systemPromptHint: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 rounded-lg bg-surface-3 border border-border-default text-[12px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent/50 resize-none transition-colors"
            />
            <p className="text-[10px] text-text-tertiary mt-1">
              {t('agentTeam.field.systemPromptHint')}
            </p>
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}

export default function WorkspaceAgentTeam() {
  const t = useT()
  const [agents, setAgents] = useState<AgentDef[]>(() =>
    AGENT_DEFS_BASE.map(a => ({ ...a, systemPromptHint: '' }))
  )

  function updateAgent(type: string, patch: Partial<AgentDef>) {
    setAgents(prev => prev.map(a => a.type === type ? { ...a, ...patch } : a))
  }

  const activeCount = agents.filter(a => a.enabled).length

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
            {activeCount}/{agents.length} {t('agentTeam.active')}
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
          {agents.map(a => {
            const Icon = a.icon
            return (
              <div
                key={a.type}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-all
                  ${a.enabled ? `${a.ringColor} ${a.iconColor}` : 'border-border-subtle bg-surface-2/40 text-text-tertiary opacity-50'}`}
              >
                <Icon className="w-3 h-3" />
                {a.label}
              </div>
            )
          })}
        </div>
      </div>

      <div className="space-y-2">
        {agents.map(agent => (
          <AgentCard
            key={agent.type}
            agent={agent}
            onUpdate={patch => updateAgent(agent.type, patch)}
          />
        ))}
      </div>
    </motion.div>
  )
}
