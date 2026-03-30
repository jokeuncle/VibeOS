import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Activity, ChevronDown, ChevronUp,
  MessageSquare, Clock, CheckCircle2,
  AlertCircle, ArrowRight, Filter, Info,
} from 'lucide-react'
import { useWorkspaceStore, type LogEntry } from '../stores/workspace'
import { useT } from '../i18n'

type TraceStatus = 'success' | 'error' | 'running' | 'info'

interface TraceGroup {
  id: string
  agentType: string
  agentLabel: string
  agentColor: string
  status: TraceStatus
  taskId?: string
  entries: LogEntry[]
  firstTimestamp: string
  lastTimestamp: string
}

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

const AGENT_FILTER_OPTIONS = ['All', 'pm', 'requirement', 'architecture', 'design', 'development', 'testing', 'cicd', 'monitoring']

function groupLogs(logs: LogEntry[]): TraceGroup[] {
  const taskGroups = new Map<string, LogEntry[]>()
  const looseEntries: LogEntry[] = []

  for (const entry of logs) {
    if (entry.taskId) {
      const key = `${entry.agent}:${entry.taskId}`
      if (!taskGroups.has(key)) taskGroups.set(key, [])
      taskGroups.get(key)!.push(entry)
    } else {
      looseEntries.push(entry)
    }
  }

  const groups: TraceGroup[] = []

  taskGroups.forEach((entries, key) => {
    const [agent] = key.split(':')
    const meta = AGENT_META[agent] ?? { label: agent, color: 'text-text-secondary' }
    const hasError = entries.some(e => e.level === 'error')
    const hasSuccess = entries.some(e => e.level === 'success')
    const status: TraceStatus = hasError ? 'error' : hasSuccess ? 'success' : 'running'
    groups.push({
      id: key,
      agentType: agent,
      agentLabel: meta.label,
      agentColor: meta.color,
      status,
      taskId: entries[0].taskId,
      entries,
      firstTimestamp: entries[0].timestamp,
      lastTimestamp: entries[entries.length - 1].timestamp,
    })
  })

  // Group loose entries by agent into batches of max 5
  const agentLoose = new Map<string, LogEntry[]>()
  for (const entry of looseEntries) {
    if (!agentLoose.has(entry.agent)) agentLoose.set(entry.agent, [])
    agentLoose.get(entry.agent)!.push(entry)
  }
  agentLoose.forEach((entries, agent) => {
    const meta = AGENT_META[agent] ?? { label: agent, color: 'text-text-secondary' }
    const hasError = entries.some(e => e.level === 'error')
    const hasSuccess = entries.some(e => e.level === 'success')
    const status: TraceStatus = hasError ? 'error' : hasSuccess ? 'success' : 'info'
    groups.push({
      id: `loose:${agent}:${entries[0].id}`,
      agentType: agent,
      agentLabel: meta.label,
      agentColor: meta.color,
      status,
      entries,
      firstTimestamp: entries[0].timestamp,
      lastTimestamp: entries[entries.length - 1].timestamp,
    })
  })

  return groups.sort((a, b) =>
    new Date(b.firstTimestamp).getTime() - new Date(a.firstTimestamp).getTime()
  )
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

function StatusIcon({ status }: { status: TraceStatus }) {
  if (status === 'success') return <CheckCircle2 className="w-3.5 h-3.5 text-success" />
  if (status === 'error')   return <AlertCircle  className="w-3.5 h-3.5 text-danger" />
  if (status === 'running') return <Activity     className="w-3.5 h-3.5 text-accent animate-pulse" />
  return <Info className="w-3.5 h-3.5 text-text-tertiary" />
}

function levelColor(level: LogEntry['level']): string {
  if (level === 'error')   return 'text-danger'
  if (level === 'success') return 'text-success'
  if (level === 'warn')    return 'text-warning'
  return 'text-text-tertiary'
}

function TraceRow({ group }: { group: TraceGroup }) {
  const [expanded, setExpanded] = useState(false)
  const summary = group.entries[group.entries.length - 1]?.message ?? ''
  const durationMs = new Date(group.lastTimestamp).getTime() - new Date(group.firstTimestamp).getTime()

  return (
    <div className={`rounded-xl border transition-all
      ${group.status === 'error' ? 'border-danger/20 bg-danger/4' : 'border-border-subtle bg-surface-1/30'}`}
    >
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer"
      >
        <StatusIcon status={group.status} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`text-[11px] font-semibold ${group.agentColor}`}>{group.agentLabel}</span>
            {group.taskId && (
              <>
                <ArrowRight className="w-3 h-3 text-text-tertiary/50" />
                <span className="text-[10px] font-mono text-text-tertiary truncate">task:{group.taskId.slice(0, 8)}</span>
              </>
            )}
          </div>
          <p className="text-[11px] text-text-tertiary truncate">{summary}</p>
        </div>

        <div className="flex items-center gap-3 shrink-0 text-[10px] font-mono text-text-tertiary">
          <span className="flex items-center gap-1">
            <MessageSquare className="w-2.5 h-2.5" />
            {group.entries.length}
          </span>
          {durationMs > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" />
              {(durationMs / 1000).toFixed(1)}s
            </span>
          )}
          <span>{relativeTime(group.firstTimestamp)}</span>
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
            <div className="px-4 pb-4 border-t border-border-subtle pt-3 space-y-1.5">
              {group.entries.map((entry, i) => (
                <div key={entry.id} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-surface-2/60 border border-border-subtle">
                  <span className="text-[10px] font-mono text-text-tertiary shrink-0 mt-0.5">{i + 1}.</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-mono font-semibold uppercase ${levelColor(entry.level)}`}>
                        {entry.level}
                      </span>
                      <span className="text-[10px] font-mono text-text-tertiary">
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-[11px] text-text-secondary mt-0.5 break-words">{entry.message}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function WorkspaceTraces() {
  const t = useT()
  const { activeWorkspaceId, executionLogs } = useWorkspaceStore()
  const logs = activeWorkspaceId ? (executionLogs[activeWorkspaceId] ?? []) : []

  const [agentFilter, setAgentFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState<TraceStatus | 'all'>('all')

  const statusFilterOptions: { value: TraceStatus | 'all'; label: string }[] = [
    { value: 'all',     label: t('traces.status.all') },
    { value: 'success', label: t('traces.status.success') },
    { value: 'error',   label: t('traces.status.error') },
    { value: 'running', label: t('traces.status.running') },
  ]

  const allGroups = useMemo(() => groupLogs(logs), [logs])

  const filtered = allGroups.filter(g => {
    if (agentFilter !== 'All' && g.agentType !== agentFilter) return false
    if (statusFilter !== 'all' && g.status !== statusFilter) return false
    return true
  })

  const errorCount = allGroups.filter(g => g.status === 'error').length
  const totalEntries = logs.length

  const stats = [
    { label: t('traces.totalExecutions'), value: allGroups.length.toString(),  icon: Activity,   color: 'text-text-primary' },
    { label: t('traces.totalTokens'),     value: `${totalEntries} logs`,        icon: MessageSquare, color: 'text-accent' },
    { label: t('traces.errors'),          value: errorCount.toString(),          icon: AlertCircle, color: errorCount > 0 ? 'text-danger' : 'text-text-tertiary' },
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
        {logs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border-default bg-surface-1/20 py-14 text-center">
            <Activity className="w-8 h-8 text-text-tertiary/40 mx-auto mb-3" />
            <p className="text-[12px] text-text-tertiary">{t('traces.noResults')}</p>
            <p className="text-[11px] text-text-tertiary/60 mt-1">Run a workflow or NLP command to see agent traces here.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-[12px] text-text-tertiary">{t('traces.noResults')}</div>
        ) : (
          filtered.map(group => <TraceRow key={group.id} group={group} />)
        )}
      </div>
    </motion.div>
  )
}
