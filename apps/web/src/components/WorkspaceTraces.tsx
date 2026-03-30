import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Activity, ChevronDown, ChevronUp, Cpu,
  Wrench, MessageSquare, Clock, CheckCircle2,
  AlertCircle, ArrowRight, Filter,
} from 'lucide-react'
import { useT } from '../i18n'

type TraceStatus = 'success' | 'error' | 'running'

interface ToolCall {
  name: string
  args: Record<string, unknown>
  result: string
  durationMs: number
}

interface TraceEntry {
  id: string
  agentType: string
  agentLabel: string
  agentColor: string
  requirementTitle: string
  phase: string
  status: TraceStatus
  model: string
  promptTokens: number
  completionTokens: number
  durationMs: number
  timestamp: string
  toolCalls: ToolCall[]
  summary: string
}

const MOCK_TRACES: TraceEntry[] = [
  {
    id: 't1',
    agentType: 'architecture',
    agentLabel: 'Architecture Agent',
    agentColor: 'text-indigo-400',
    requirementTitle: 'User authentication with OAuth2',
    phase: 'Architecture',
    status: 'success',
    model: 'claude-opus-4-5',
    promptTokens: 4820,
    completionTokens: 1340,
    durationMs: 8200,
    timestamp: '2 min ago',
    summary: 'Designed JWT-based auth with PostgreSQL user store and Redis session cache.',
    toolCalls: [
      { name: 'evaluate_tech_stack', args: { requirement: 'OAuth2 auth flow' }, result: 'Recommended: FastAPI + PostgreSQL + Redis', durationMs: 1200 },
      { name: 'generate_schema', args: { tables: ['users', 'sessions', 'oauth_providers'] }, result: '3 tables with indexes defined', durationMs: 2100 },
      { name: 'design_api', args: { endpoints: ['/auth/login', '/auth/callback', '/auth/refresh'] }, result: 'OpenAPI 3.0 spec generated', durationMs: 1800 },
      { name: 'workspace_create_artifact', args: { phase: 'architecture', type: 'schema' }, result: 'Artifact #arch-42 created', durationMs: 320 },
    ],
  },
  {
    id: 't2',
    agentType: 'requirement',
    agentLabel: 'Requirement Agent',
    agentColor: 'text-blue-400',
    requirementTitle: 'User authentication with OAuth2',
    phase: 'Requirement',
    status: 'success',
    model: 'claude-sonnet-4-5',
    promptTokens: 2100,
    completionTokens: 890,
    durationMs: 4300,
    timestamp: '5 min ago',
    summary: 'Extracted 6 user stories, 14 acceptance criteria across login, registration, and token refresh flows.',
    toolCalls: [
      { name: 'analyze_requirements', args: { input: 'User authentication with OAuth2' }, result: '6 user stories extracted', durationMs: 1800 },
      { name: 'generate_user_stories', args: { count: 6 }, result: 'Stories: login, register, forgot password, OAuth callback, refresh, logout', durationMs: 1200 },
      { name: 'create_acceptance_criteria', args: { stories: 6 }, result: '14 BDD-style criteria created', durationMs: 900 },
    ],
  },
  {
    id: 't3',
    agentType: 'development',
    agentLabel: 'Dev Agent',
    agentColor: 'text-emerald-400',
    requirementTitle: 'Product catalog with search',
    phase: 'Development',
    status: 'error',
    model: 'gemini-2.5-pro',
    promptTokens: 8400,
    completionTokens: 2100,
    durationMs: 15200,
    timestamp: '12 min ago',
    summary: 'GitLab push failed — branch protection rule prevents direct push to main.',
    toolCalls: [
      { name: 'generate_code', args: { module: 'catalog_api', language: 'Python' }, result: '340 lines generated', durationMs: 4200 },
      { name: 'gitlab_push_file', args: { branch: 'main', path: 'api/catalog.py' }, result: 'ERROR: 403 Protected branch', durationMs: 890 },
    ],
  },
  {
    id: 't4',
    agentType: 'pm',
    agentLabel: 'PM Agent',
    agentColor: 'text-violet-400',
    requirementTitle: 'Product catalog with search',
    phase: 'Orchestration',
    status: 'success',
    model: 'claude-opus-4-5',
    promptTokens: 1240,
    completionTokens: 320,
    durationMs: 1800,
    timestamp: '13 min ago',
    summary: 'Dispatched requirement to requirement-agent. Workflow lock acquired.',
    toolCalls: [
      { name: 'intent_classify', args: { input: 'Add a product catalog with full-text search' }, result: 'intent: create_requirement, confidence: 0.97', durationMs: 600 },
      { name: 'workflow_dispatch', args: { phase: 'requirement', workspaceId: 'ws-42' }, result: 'Dispatched successfully', durationMs: 240 },
    ],
  },
]

const AGENT_FILTER_OPTIONS = ['All', 'pm', 'requirement', 'architecture', 'design', 'development', 'testing', 'cicd', 'monitoring']

function StatusIcon({ status }: { status: TraceStatus }) {
  if (status === 'success') return <CheckCircle2 className="w-3.5 h-3.5 text-success" />
  if (status === 'error') return <AlertCircle className="w-3.5 h-3.5 text-danger" />
  return <Activity className="w-3.5 h-3.5 text-accent animate-pulse" />
}

function TraceRow({ trace }: { trace: TraceEntry }) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)
  const totalTokens = trace.promptTokens + trace.completionTokens

  return (
    <div className={`rounded-xl border transition-all
      ${trace.status === 'error' ? 'border-danger/20 bg-danger/4' : 'border-border-subtle bg-surface-1/30'}`}
    >
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer"
      >
        <StatusIcon status={trace.status} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`text-[11px] font-semibold ${trace.agentColor}`}>{trace.agentLabel}</span>
            <ArrowRight className="w-3 h-3 text-text-tertiary/50" />
            <span className="text-[11px] text-text-secondary font-medium truncate">{trace.requirementTitle}</span>
          </div>
          <p className="text-[11px] text-text-tertiary truncate">{trace.summary}</p>
        </div>

        <div className="flex items-center gap-3 shrink-0 text-[10px] font-mono text-text-tertiary">
          <span className="flex items-center gap-1">
            <Cpu className="w-2.5 h-2.5" />
            {totalTokens.toLocaleString()}t
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-2.5 h-2.5" />
            {(trace.durationMs / 1000).toFixed(1)}s
          </span>
          <span>{trace.timestamp}</span>
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t border-border-subtle pt-3 space-y-3">
              <div className="flex items-center gap-4 text-[10px] font-mono text-text-tertiary">
                <span className="flex items-center gap-1"><MessageSquare className="w-2.5 h-2.5" />model: {trace.model}</span>
                <span>prompt: {trace.promptTokens.toLocaleString()}t</span>
                <span>completion: {trace.completionTokens.toLocaleString()}t</span>
                <span>phase: {trace.phase}</span>
              </div>

              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Wrench className="w-3 h-3 text-text-tertiary" />
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">
                    {t('traces.toolCalls')} ({trace.toolCalls.length})
                  </span>
                </div>
                <div className="space-y-1.5">
                  {trace.toolCalls.map((tc, i) => (
                    <div key={i} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-surface-2/60 border border-border-subtle">
                      <span className="text-[10px] font-mono text-text-tertiary shrink-0 mt-0.5">{i + 1}.</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono font-semibold text-accent">{tc.name}</span>
                          <span className="text-[10px] font-mono text-text-tertiary">{tc.durationMs}ms</span>
                        </div>
                        <p className="text-[10px] text-text-tertiary mt-0.5 truncate">→ {tc.result}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function WorkspaceTraces() {
  const t = useT()
  const [agentFilter, setAgentFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState<TraceStatus | 'all'>('all')

  const statusFilterOptions: { value: TraceStatus | 'all'; label: string }[] = [
    { value: 'all', label: t('traces.status.all') },
    { value: 'success', label: t('traces.status.success') },
    { value: 'error', label: t('traces.status.error') },
    { value: 'running', label: t('traces.status.running') },
  ]

  const filtered = MOCK_TRACES.filter(tr => {
    if (agentFilter !== 'All' && tr.agentType !== agentFilter) return false
    if (statusFilter !== 'all' && tr.status !== statusFilter) return false
    return true
  })

  const totalTokens = MOCK_TRACES.reduce((sum, tr) => sum + tr.promptTokens + tr.completionTokens, 0)
  const errorCount = MOCK_TRACES.filter(tr => tr.status === 'error').length

  const stats = [
    { label: t('traces.totalExecutions'), value: MOCK_TRACES.length.toString(), icon: Activity, color: 'text-text-primary' },
    { label: t('traces.totalTokens'), value: totalTokens.toLocaleString(), icon: Cpu, color: 'text-accent' },
    { label: t('traces.errors'), value: errorCount.toString(), icon: AlertCircle, color: errorCount > 0 ? 'text-danger' : 'text-text-tertiary' },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-6"
    >
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Activity className="w-4 h-4 text-accent" />
          <h1 className="text-base font-semibold text-text-primary tracking-tight">{t('traces.title')}</h1>
        </div>
        <p className="text-[12px] text-text-tertiary">{t('traces.desc')}</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {stats.map(stat => {
          const Icon = stat.icon
          return (
            <div key={stat.label} className="rounded-xl border border-border-subtle bg-surface-1/30 px-4 py-3.5">
              <div className="flex items-center gap-1.5 mb-2">
                <Icon className={`w-3 h-3 ${stat.color}`} />
                <span className="text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">{stat.label}</span>
              </div>
              <span className={`text-xl font-semibold font-mono ${stat.color}`}>{stat.value}</span>
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-3">
        <Filter className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
        <div className="flex items-center gap-px p-0.5 rounded-lg bg-surface-2 border border-border-subtle">
          {AGENT_FILTER_OPTIONS.slice(0, 5).map(opt => (
            <button
              key={opt}
              onClick={() => setAgentFilter(opt)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer
                ${agentFilter === opt ? 'bg-surface-4 text-text-primary' : 'text-text-tertiary hover:text-text-secondary'}`}
            >
              {opt === 'All' ? t('traces.allAgents') : opt}
            </button>
          ))}
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as TraceStatus | 'all')}
          className="px-2.5 py-1.5 rounded-lg bg-surface-2 border border-border-subtle text-[11px] text-text-secondary focus:outline-none cursor-pointer"
        >
          {statusFilterOptions.map(opt => (
            <option key={opt.value} value={opt.value} className="bg-surface-3">{opt.label}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-[12px] text-text-tertiary">{t('traces.noResults')}</div>
        ) : (
          filtered.map(trace => <TraceRow key={trace.id} trace={trace} />)
        )}
      </div>
    </motion.div>
  )
}
