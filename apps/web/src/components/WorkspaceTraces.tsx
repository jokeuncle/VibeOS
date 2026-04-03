import { useCallback, useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Activity, ChevronDown, ChevronUp,
  Clock, CheckCircle2,
  AlertCircle, Filter, Info, Zap, RefreshCw, ScrollText, FileStack,
} from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspace'
import { useT } from '../i18n'
import type { TranslationKey } from '../i18n/en'
import type { AgentExecution } from '../types'
import ArtifactPanel from './ArtifactPanel'
import FormSelect from './ui/FormSelect'

type TraceStatus = 'success' | 'error' | 'running' | 'info'
type TracesMainTab = 'runs' | 'artifacts'

const AGENT_META: Record<string, { label: string; color: string }> = {
  pm:           { label: 'PM Agent',           color: 'text-violet-400' },
  requirement:  { label: 'Requirement Agent',  color: 'text-blue-400' },
  architecture: { label: 'Architecture Agent', color: 'text-indigo-400' },
  design:       { label: 'Design Agent',       color: 'text-pink-400' },
  development:  { label: 'Dev Agent',          color: 'text-emerald-400' },
  testing:      { label: 'Test Agent',         color: 'text-yellow-400' },
  cicd:         { label: 'CI/CD Agent',        color: 'text-orange-400' },
  monitoring:   { label: 'Monitoring Agent',   color: 'text-cyan-400' },
}

const AGENT_FILTER_OPTIONS = ['All', 'pm', 'requirement', 'architecture', 'design', 'development', 'testing', 'cicd', 'monitoring'] as const

const TRACE_AGENT_TAB_TYPES = new Set<string>(AGENT_FILTER_OPTIONS.filter((o): o is Exclude<(typeof AGENT_FILTER_OPTIONS)[number], 'All'> => o !== 'All'))

function agentFilterTabLabel(t: (key: TranslationKey) => string, opt: (typeof AGENT_FILTER_OPTIONS)[number]): string {
  if (opt === 'All') return t('traces.allAgents')
  return t(`agentTeam.agent.${opt}.name` as TranslationKey)
}

function executionAgentLabel(t: (key: TranslationKey) => string, agentType: string): string {
  if (TRACE_AGENT_TAB_TYPES.has(agentType)) {
    return t(`agentTeam.agent.${agentType}.name` as TranslationKey)
  }
  return agentType
}

function execToStatus(exec: AgentExecution): TraceStatus {
  if (exec.status === 'failed') return 'error'
  if (exec.status === 'success') return 'success'
  if (exec.status === 'running' || exec.status === 'queued') return 'running'
  return 'info'
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  return `${h}h ago`
}

function statusRailClass(status: TraceStatus): string {
  if (status === 'success') return 'bg-success/10 text-success'
  if (status === 'error') return 'bg-danger/10 text-danger'
  if (status === 'running') return 'bg-accent/10 text-accent'
  return 'bg-surface-3 text-text-tertiary'
}

function StatusIcon({ status }: { status: TraceStatus }) {
  if (status === 'success') return <CheckCircle2 className="w-3.5 h-3.5" />
  if (status === 'error') return <AlertCircle className="w-3.5 h-3.5" />
  if (status === 'running') return <Activity className="w-3.5 h-3.5 animate-pulse" />
  return <Info className="w-3.5 h-3.5" />
}

function ExecutionTraceRow({ exec, requirementName, onRequirementClick }: {
  exec: AgentExecution
  requirementName?: string
  onRequirementClick?: (reqId: string) => void
}) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)
  const status = execToStatus(exec)
  const meta = AGENT_META[exec.agentType] ?? { label: exec.agentType, color: 'text-text-secondary' }
  const agentLabel = executionAgentLabel(t, exec.agentType)
  const durationMs = exec.completedAt
    ? new Date(exec.completedAt).getTime() - new Date(exec.startedAt).getTime()
    : 0

  function toggleExpanded() {
    setExpanded(v => !v)
  }

  function rowKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      toggleExpanded()
    }
  }

  return (
    <div
      className={`border-b border-border-subtle last:border-b-0 ${
        status === 'error' ? 'bg-danger/[0.04]' : ''
      }`}
    >
      {/* div+role=button: nested requirement control must stay a real <button> */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={toggleExpanded}
        onKeyDown={rowKeyDown}
        className="group mx-0.5 flex w-full cursor-pointer items-start gap-2.5 rounded-lg px-3 py-3 text-left transition-colors hover:bg-surface-2/35 sm:mx-1 sm:px-4 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent/35"
      >
        <div
          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${statusRailClass(status)}`}
        >
          <StatusIcon status={status} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className={`text-[11px] font-semibold ${meta.color}`}>{agentLabel}</span>
            <span className="text-[10px] font-mono text-text-tertiary truncate max-w-[min(100%,280px)]">
              {exec.intentSummary}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[11px] text-text-tertiary truncate min-w-0">
              {exec.triggeredBy} &middot; {exec.intentType}
              {exec.errorMessage && ` — ${exec.errorMessage}`}
            </p>
            {requirementName && exec.requirementId && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onRequirementClick?.(exec.requirementId!)
                }}
                className="shrink-0 rounded-md border border-border-subtle bg-surface-2/40 px-2 py-0.5 text-[10px] font-medium text-text-secondary hover:bg-surface-2/55 transition-colors cursor-pointer"
              >
                {requirementName}
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 text-[10px] font-mono text-text-tertiary tabular-nums">
          <span className="flex items-center gap-1">
            <Zap className="w-2.5 h-2.5 opacity-80" />
            {exec.steps.length}
          </span>
          {durationMs > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="w-2.5 h-2.5 opacity-80" />
              {(durationMs / 1000).toFixed(1)}s
            </span>
          )}
          <span>{relativeTime(exec.startedAt)}</span>
          {expanded ? (
            <ChevronUp className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
          )}
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="mx-3 mb-3 mt-0 space-y-1.5 border-t border-border-subtle pt-3 sm:mx-4">
              {exec.steps.length === 0 && (
                <div className="space-y-1">
                  <p className="text-[11px] text-text-tertiary">{t('traces.noStepsRecorded')}</p>
                  <p className="text-[10px] text-text-tertiary leading-relaxed">{t('traces.noStepsHint')}</p>
                </div>
              )}
              {exec.steps.map((step, i) => (
                <div
                  key={step.id}
                  className="flex items-start gap-2 px-3 py-2 rounded-lg bg-surface-2/40 border border-border-subtle"
                >
                  <span className="text-[10px] font-mono text-text-tertiary shrink-0 mt-0.5">{i + 1}.</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-mono font-semibold uppercase ${
                        step.status === 'error' ? 'text-danger'
                        : step.status === 'completed' ? 'text-success'
                        : step.status === 'running' ? 'text-accent'
                        : 'text-text-tertiary'
                      }`}>
                        {step.status}
                      </span>
                    </div>
                    <p className="mt-0.5 break-words text-xs text-text-primary/90">{step.label}</p>
                    {step.detail && <p className="text-[10px] text-text-tertiary mt-0.5">{step.detail}</p>}
                  </div>
                </div>
              ))}
              {exec.errorMessage && (
                <div className="px-3 py-2 rounded-lg bg-surface-2/40 border border-danger/25">
                  <p className="text-[11px] text-danger break-words">{exec.errorMessage}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function WorkspaceTraces() {
  const t = useT()
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const executions = useWorkspaceStore((s) => s.executions)
  const fetchExecutions = useWorkspaceStore((s) => s.fetchExecutions)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const setActiveRequirement = useWorkspaceStore((s) => s.setActiveRequirement)

  const workspace = workspaces.find(w => w.id === activeWorkspaceId)
  const requirements = workspace?.requirements ?? []

  const reqNameMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const r of requirements) {
      map[r.id] = r.title
    }
    return map
  }, [requirements])

  useEffect(() => {
    if (activeWorkspaceId && !activeWorkspaceId.startsWith('ws-temp-')) {
      void fetchExecutions()
    }
  }, [activeWorkspaceId, fetchExecutions])

  const [agentFilter, setAgentFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState<TraceStatus | 'all'>('all')
  const [reqFilter, setReqFilter] = useState('all')
  const [mainTab, setMainTab] = useState<TracesMainTab>('runs')
  const tabBaseId = useId()
  const runsTabId = `${tabBaseId}-runs-tab`
  const artifactsTabId = `${tabBaseId}-artifacts-tab`
  const runsPanelId = `${tabBaseId}-runs-panel`
  const artifactsPanelId = `${tabBaseId}-artifacts-panel`

  const reqFilterOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [{ value: 'all', label: t('traces.allRequirements' as TranslationKey) }]
    const seen = new Set<string>()
    for (const exec of executions) {
      if (exec.requirementId && !seen.has(exec.requirementId)) {
        seen.add(exec.requirementId)
        opts.push({
          value: exec.requirementId,
          label: reqNameMap[exec.requirementId] || exec.requirementId.slice(0, 8),
        })
      }
    }
    return opts
  }, [executions, reqNameMap, t])

  const statusFilterOptions: { value: TraceStatus | 'all'; label: string }[] = [
    { value: 'all',     label: t('traces.status.all') },
    { value: 'success', label: t('traces.status.success') },
    { value: 'error',   label: t('traces.status.error') },
    { value: 'running', label: t('traces.status.running') },
  ]

  const filtered = useMemo(() => {
    return executions.filter(exec => {
      if (agentFilter !== 'All' && exec.agentType !== agentFilter) return false
      if (statusFilter !== 'all' && execToStatus(exec) !== statusFilter) return false
      if (reqFilter !== 'all' && exec.requirementId !== reqFilter) return false
      return true
    })
  }, [executions, agentFilter, statusFilter, reqFilter])

  const traceExecutionAllowlist = useMemo(() => new Set(filtered.map(e => e.id)), [filtered])

  const allFiltersDefault =
    agentFilter === 'All' && statusFilter === 'all' && reqFilter === 'all'

  const errorCount = executions.filter(e => e.status === 'failed').length
  const [refreshing, setRefreshing] = useState(false)

  const handleRefresh = useCallback(async () => {
    if (!activeWorkspaceId || activeWorkspaceId.startsWith('ws-temp-')) return
    setRefreshing(true)
    try {
      await fetchExecutions()
    } finally {
      setRefreshing(false)
    }
  }, [activeWorkspaceId, fetchExecutions])

  const stats = [
    { label: t('traces.totalExecutions'), value: executions.length.toString(), icon: Activity, color: 'text-text-primary' },
    {
      label: t('traces.activeRuns'),
      value: String(executions.filter(e => e.status === 'running' || e.status === 'queued').length),
      icon: Zap,
      color: 'text-accent',
    },
    { label: t('traces.errors'), value: errorCount.toString(), icon: AlertCircle, color: errorCount > 0 ? 'text-danger' : 'text-text-tertiary' },
  ]

  const filterPanel = (
    <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface-1/30">
      <div className="border-b border-border-subtle bg-surface-2/15 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 shrink-0 text-text-tertiary" aria-hidden />
          <span className="text-xs font-medium text-text-secondary">{t('traces.filtersHeading')}</span>
        </div>
        <p className="mt-1.5 text-[10px] leading-relaxed text-text-tertiary">{t('traces.filtersSyncedHint')}</p>
      </div>
      <div className="space-y-5 p-4 sm:p-5">
        <div className="min-w-0">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
            {t('traces.filter.agent')}
          </p>
          <div className="flex max-w-full flex-wrap gap-1 rounded-lg border border-border-subtle bg-surface-2/40 p-1">
            {AGENT_FILTER_OPTIONS.map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => setAgentFilter(opt)}
                className={`shrink-0 cursor-pointer rounded-md border px-2.5 py-1.5 text-[11px] font-medium transition-colors
                  ${
                    agentFilter === opt
                      ? 'border-accent/30 bg-accent/10 text-text-primary'
                      : 'border-transparent text-text-tertiary hover:bg-surface-2/50 hover:text-text-secondary'
                  }`}
              >
                {agentFilterTabLabel(t, opt)}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          <FormSelect
            size="sm"
            fullWidth
            prefix={t('traces.statusFilter')}
            value={statusFilter}
            options={statusFilterOptions}
            onChange={v => setStatusFilter(v as TraceStatus | 'all')}
            aria-label={t('traces.statusFilter')}
          />
          {reqFilterOptions.length > 1 && (
            <FormSelect
              size="sm"
              fullWidth
              prefix={t('traces.requirementFilter' as TranslationKey)}
              value={reqFilter}
              options={reqFilterOptions}
              onChange={v => setReqFilter(v)}
              aria-label={t('traces.requirementFilter' as TranslationKey)}
            />
          )}
        </div>
      </div>
    </div>
  )

  const runsPanelBody =
    executions.length === 0 ? (
      <div className="mx-2 mb-2 rounded-xl border border-dashed border-border-subtle bg-surface-2/15 px-6 py-16 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10">
          <Activity className="h-6 w-6 text-accent/80" />
        </div>
        <p className="text-sm font-medium text-text-primary">{t('traces.noResults')}</p>
        <p className="mx-auto mt-2 max-w-sm text-[12px] leading-relaxed text-text-tertiary">{t('traces.emptyHint')}</p>
      </div>
    ) : filtered.length === 0 ? (
      <div className="py-16 text-center">
        <p className="text-[13px] text-text-secondary">{t('traces.noResults')}</p>
        <p className="mx-auto mt-2 max-w-xs text-[11px] text-text-tertiary">{t('traces.emptyHint')}</p>
      </div>
    ) : (
      <div className="bg-surface-2/15">
        <div className="hidden border-b border-border-subtle px-4 py-2.5 sm:flex sm:items-center sm:justify-between sm:pl-[3.65rem] sm:pr-5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
            {t('traces.listHeader.details')}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary tabular-nums">
            {t('traces.listHeader.timing')}
          </span>
        </div>
        <div className="py-1">
          {filtered.map(exec => (
            <ExecutionTraceRow
              key={exec.id}
              exec={exec}
              requirementName={exec.requirementId ? reqNameMap[exec.requirementId] : undefined}
              onRequirementClick={reqId => setActiveRequirement(reqId)}
            />
          ))}
        </div>
      </div>
    )

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="space-y-8"
    >
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10">
            <Activity className="h-4 w-4 text-accent" aria-hidden />
          </div>
          <div className="min-w-0 pt-0.5">
            <h1 className="text-base font-semibold tracking-tight text-text-primary">{t('traces.title')}</h1>
            <p className="mt-1 max-w-xl text-[12px] leading-relaxed text-text-tertiary">{t('traces.desc')}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleRefresh()}
          disabled={refreshing || !activeWorkspaceId || activeWorkspaceId.startsWith('ws-temp-')}
          className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-md border border-border-subtle bg-surface-2/40 px-3 py-1.5 text-[11px] font-medium text-text-secondary transition-colors hover:bg-surface-2/55 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          aria-label={t('common.refresh')}
        >
          <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} aria-hidden />
          {t('common.refresh')}
        </button>
      </header>

      <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface-1/30 p-1.5">
        <div className="flex flex-col divide-y divide-border-subtle rounded-lg bg-surface-2/25 sm:flex-row sm:divide-x sm:divide-y-0">
          {stats.map(stat => {
            const Icon = stat.icon
            return (
              <div
                key={stat.label}
                className="relative flex flex-1 flex-col items-center px-5 py-5 sm:items-stretch sm:px-6 sm:py-6"
              >
                <Icon
                  className={`absolute right-3 top-3 h-3.5 w-3.5 opacity-[0.35] sm:right-4 sm:top-4 ${stat.color}`}
                  aria-hidden
                />
                <span className={`font-mono text-2xl font-semibold tabular-nums sm:text-[1.65rem] ${stat.color}`}>
                  {stat.value}
                </span>
                <span className="mt-1.5 text-center text-[10px] font-semibold uppercase tracking-wider text-text-secondary sm:text-left">
                  {stat.label}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start lg:gap-8">
        <aside className="min-w-0 space-y-4 lg:sticky lg:top-2 lg:col-span-4">{filterPanel}</aside>

        <section className="min-w-0 lg:col-span-8">
          <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface-1/30">
            <div className="border-b border-border-subtle bg-surface-2/15">
              <div className="flex items-end justify-between gap-3 px-4 sm:px-5">
                <div
                  role="tablist"
                  aria-label={t('traces.tabsAria')}
                  className="flex min-w-0 gap-6 sm:gap-10"
                >
                  <button
                    type="button"
                    role="tab"
                    id={runsTabId}
                    aria-selected={mainTab === 'runs'}
                    aria-controls={runsPanelId}
                    tabIndex={mainTab === 'runs' ? 0 : -1}
                    onClick={() => setMainTab('runs')}
                    className={`relative -mb-px cursor-pointer border-b-2 pt-4 pb-3 text-[13px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1/30
                      ${
                        mainTab === 'runs'
                          ? 'border-accent text-text-primary'
                          : 'border-transparent text-text-tertiary hover:text-text-secondary'
                      }`}
                  >
                    <span className="flex items-center gap-2">
                      <ScrollText className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                      <span className="truncate">{t('traces.runsHeading')}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    id={artifactsTabId}
                    aria-selected={mainTab === 'artifacts'}
                    aria-controls={artifactsPanelId}
                    tabIndex={mainTab === 'artifacts' ? 0 : -1}
                    onClick={() => setMainTab('artifacts')}
                    className={`relative -mb-px cursor-pointer border-b-2 pt-4 pb-3 text-[13px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1/30
                      ${
                        mainTab === 'artifacts'
                          ? 'border-accent text-text-primary'
                          : 'border-transparent text-text-tertiary hover:text-text-secondary'
                      }`}
                  >
                    <span className="flex items-center gap-2">
                      <FileStack className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                      <span className="truncate">{t('artifact.title')}</span>
                    </span>
                  </button>
                </div>
                {mainTab === 'runs' && executions.length > 0 && (
                  <span className="mb-3 hidden font-mono text-[10px] tabular-nums text-text-tertiary sm:block">
                    {filtered.length}/{executions.length}
                  </span>
                )}
              </div>
            </div>
            {mainTab === 'runs' && (
              <div id={runsPanelId} role="tabpanel" aria-labelledby={runsTabId}>
                {runsPanelBody}
              </div>
            )}
            {mainTab === 'artifacts' && (
              <div id={artifactsPanelId} role="tabpanel" aria-labelledby={artifactsTabId}>
                <p className="border-b border-border-subtle px-4 py-3 text-[11px] leading-relaxed text-text-tertiary sm:px-5">
                  {t('traces.artifactsHint')}
                </p>
                <div className="p-4 sm:p-5">
                  <ArtifactPanel
                    embedded
                    traceExecutionAllowlist={traceExecutionAllowlist}
                    traceShowOrphansWithoutExecution={allFiltersDefault}
                    traceOrphanAgentFilter={agentFilter}
                    traceOrphanStatusFilter={statusFilter}
                    traceOrphanReqFilter={reqFilter}
                  />
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </motion.div>
  )
}
