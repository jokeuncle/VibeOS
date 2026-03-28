import { useRef, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Terminal, Filter, Trash2 } from 'lucide-react'
import { useT } from '../i18n'
import { useWorkspaceStore, type LogEntry } from '../stores/workspace'
import type { Agent, AgentType } from '../types'
import type { TranslationKey } from '../i18n/en'

const LEVEL_COLOR: Record<string, string> = {
  info: 'text-blue-400',
  warn: 'text-yellow-400',
  error: 'text-red-400',
  success: 'text-emerald-400',
}

const LEVEL_ICON: Record<string, string> = {
  info: 'i',
  warn: '!',
  error: '✕',
  success: '✓',
}

const AGENT_COLOR: Record<string, string> = {
  pm: 'text-violet-400',
  requirement: 'text-cyan-400',
  design: 'text-pink-400',
  architecture: 'text-orange-400',
  development: 'text-blue-400',
  frontend: 'text-blue-400',
  backend: 'text-indigo-400',
  testing: 'text-emerald-400',
  qa: 'text-emerald-400',
  cicd: 'text-yellow-400',
  devops: 'text-yellow-400',
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
  const executionLogs = useWorkspaceStore((s) => s.executionLogs)

  const allLogs = activeWorkspaceId ? executionLogs[activeWorkspaceId] || [] : []

  const filtered = allLogs.filter((l) => {
    if (taskId && l.taskId !== taskId) return false
    if (filter !== 'all' && l.agent !== filter) return false
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
            {filtered.map((log) => (
              <motion.div
                key={log.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.15 }}
                className="flex gap-2 py-0.5 hover:bg-white/[0.02] rounded px-1 -mx-1"
              >
                <span className="text-text-tertiary/40 shrink-0">{formatTs(log.timestamp)}</span>
                <span className={`shrink-0 w-10 text-right ${AGENT_COLOR[log.agent] || 'text-text-tertiary'}`}>
                  {log.agent === 'cicd' || log.agent === 'devops'
                    ? 'OPS'
                    : (log.agent || '').slice(0, 4).toUpperCase()}
                </span>
                <span className={`shrink-0 ${LEVEL_COLOR[log.level] || 'text-text-tertiary'}`}>
                  {LEVEL_ICON[log.level] || 'i'}
                </span>
                <span className="text-text-primary/80">{log.message}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}
