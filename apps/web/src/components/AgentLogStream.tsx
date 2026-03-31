import { useRef, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Terminal, Filter } from 'lucide-react'
import { useT } from '../i18n'
import { useWorkspaceStore } from '../stores/workspace'
import type { Agent, AgentExecution } from '../types'

const STATUS_COLOR: Record<string, string> = {
  running: 'text-blue-400',
  queued: 'text-yellow-400',
  failed: 'text-red-400',
  success: 'text-emerald-400',
  cancelled: 'text-text-tertiary',
}

const STATUS_ICON: Record<string, string> = {
  running: '▶',
  queued: '…',
  failed: '✕',
  success: '✓',
  cancelled: '—',
}

const AGENT_COLOR: Record<string, string> = {
  pm: 'text-violet-400',
  requirement: 'text-cyan-400',
  design: 'text-pink-400',
  architecture: 'text-orange-400',
  development: 'text-blue-400',
  testing: 'text-emerald-400',
  cicd: 'text-yellow-400',
  monitoring: 'text-teal-400',
}

const ALL_AGENTS: string[] = ['pm', 'requirement', 'design', 'architecture', 'development', 'testing', 'cicd', 'monitoring']

interface Props {
  agents: Agent[]
  taskId?: string
}

export default function AgentLogStream({ agents, taskId }: Props) {
  const t = useT()
  const [filter, setFilter] = useState<string>('all')
  const scrollRef = useRef<HTMLDivElement>(null)

  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const executions = useWorkspaceStore((s) => s.executions)
  const fetchExecutions = useWorkspaceStore((s) => s.fetchExecutions)

  useEffect(() => {
    if (activeWorkspaceId && !activeWorkspaceId.startsWith('ws-temp-')) {
      void fetchExecutions()
    }
  }, [activeWorkspaceId, fetchExecutions])

  const filtered = executions.filter((e) => {
    if (taskId && !e.taskIds?.includes(taskId)) return false
    if (filter !== 'all' && e.agentType !== filter) return false
    return true
  })

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [filtered.length])

  const formatTs = (ts: string) => {
    try {
      const d = new Date(ts)
      return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
    } catch {
      return ts
    }
  }

  return (
    <div className="rounded-xl border border-border-subtle overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border-subtle bg-surface-1/30 flex items-center gap-2">
        <Terminal className="w-3.5 h-3.5 text-text-tertiary" />
        <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
          {taskId ? t('agent.taskLog') : t('agent.logStream')}
        </span>
        <div className="flex-1" />
        {!taskId && (
          <>
            <Filter className="w-3 h-3 text-text-tertiary" />
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => setFilter('all')}
                className={`px-2 py-0.5 rounded text-[10px] font-mono cursor-pointer transition-colors ${
                  filter === 'all' ? 'bg-accent/10 text-accent' : 'text-text-tertiary hover:text-text-secondary'
                }`}
              >
                ALL
              </button>
              {ALL_AGENTS.filter((a) => agents.some((ag) => ag.type === a)).map((type) => (
                <button
                  key={type}
                  onClick={() => setFilter(type)}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono cursor-pointer transition-colors ${
                    filter === type ? 'bg-accent/10 text-accent' : 'text-text-tertiary hover:text-text-secondary'
                  }`}
                >
                  {type === 'cicd' || type === 'devops' ? 'OPS' : type.slice(0, 4).toUpperCase()}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div
        ref={scrollRef}
        className="bg-surface-0 p-3 h-64 overflow-y-auto font-mono text-[11px] leading-relaxed"
      >
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-text-tertiary text-xs">
            {t('agent.noLogs')}
          </div>
        ) : (
          <AnimatePresence>
            {filtered.map((exec) => (
              <motion.div
                key={exec.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.15 }}
                className="flex gap-2 py-0.5 hover:bg-white/[0.02] rounded px-1 -mx-1"
              >
                <span className="text-text-tertiary/40 shrink-0">{formatTs(exec.startedAt)}</span>
                <span className={`shrink-0 w-10 text-right ${AGENT_COLOR[exec.agentType] || 'text-text-tertiary'}`}>
                  {exec.agentType === 'cicd'
                    ? 'OPS'
                    : (exec.agentType || '').slice(0, 4).toUpperCase()}
                </span>
                <span className={`shrink-0 ${STATUS_COLOR[exec.status] || 'text-text-tertiary'}`}>
                  {STATUS_ICON[exec.status] || '·'}
                </span>
                <span className="text-text-primary/80 truncate">{exec.intentSummary}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}
