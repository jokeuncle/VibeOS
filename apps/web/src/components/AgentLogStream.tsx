import { useRef, useEffect, useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Terminal, Filter, Trash2, ChevronDown } from 'lucide-react'
import { useT } from '../i18n'
import { useWorkspaceStore } from '../stores/workspace'
import type { AgentLogEntry } from '../stores/workspace/types'

const LEVEL_STYLE: Record<string, { color: string; icon: string }> = {
  info: { color: 'text-text-tertiary', icon: '·' },
  success: { color: 'text-emerald-400', icon: '✓' },
  warn: { color: 'text-yellow-400', icon: '!' },
  error: { color: 'text-red-400', icon: '✕' },
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

const ALL_AGENTS = ['requirement', 'architecture', 'design', 'development', 'testing', 'cicd']

export default function AgentLogStream() {
  const t = useT()
  const [filter, setFilter] = useState<string>('all')
  const [autoScroll, setAutoScroll] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)

  const agentLogs = useWorkspaceStore((s) => s.agentLogs)
  const clearAgentLogs = useWorkspaceStore((s) => s.clearAgentLogs)
  const workflowRunning = useWorkspaceStore((s) => s.workflowRunning)

  const filtered = useMemo(() => {
    if (filter === 'all') return agentLogs
    return agentLogs.filter((l) => l.agent === filter)
  }, [agentLogs, filter])

  const grouped = useMemo(() => {
    const groups: { phase: string; logs: AgentLogEntry[] }[] = []
    let current: { phase: string; logs: AgentLogEntry[] } | null = null
    for (const log of filtered) {
      const key = log.phase || 'general'
      if (!current || current.phase !== key) {
        current = { phase: key, logs: [] }
        groups.push(current)
      }
      current.logs.push(log)
    }
    return groups
  }, [filtered])

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [filtered.length, autoScroll])

  const handleScroll = () => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 40)
  }

  const formatTs = (ts: string) => {
    try {
      return new Date(ts).toLocaleTimeString('en-US', {
        hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
      })
    } catch { return ts }
  }

  return (
    <div className="rounded-xl border border-border-subtle overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border-subtle bg-surface-1/30 flex items-center gap-2">
        <Terminal className="w-3.5 h-3.5 text-text-tertiary" />
        <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
          {t('agent.logStream')}
        </span>
        {workflowRunning && (
          <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        )}
        <span className="text-[10px] text-text-tertiary ml-1">
          ({filtered.length})
        </span>
        <div className="flex-1" />

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
          {ALL_AGENTS.map((type) => (
            <button
              key={type}
              onClick={() => setFilter(type)}
              className={`px-2 py-0.5 rounded text-[10px] font-mono cursor-pointer transition-colors ${
                filter === type ? 'bg-accent/10 text-accent' : 'text-text-tertiary hover:text-text-secondary'
              }`}
            >
              {type.slice(0, 4).toUpperCase()}
            </button>
          ))}
        </div>

        <button
          onClick={clearAgentLogs}
          className="ml-2 p-1 rounded hover:bg-surface-2/40 text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer"
          title="Clear logs"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="bg-surface-0 p-3 h-64 overflow-y-auto font-mono text-[11px] leading-relaxed"
      >
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-text-tertiary text-xs">
            {workflowRunning ? 'Waiting for agent logs...' : t('agent.noLogs')}
          </div>
        ) : (
          <div>
            {grouped.map((group) => (
              <div key={`${group.phase}-${group.logs[0]?.id}`}>
                {group.phase !== 'general' && (
                  <div className="flex items-center gap-1.5 mt-2 mb-1 first:mt-0">
                    <ChevronDown className="w-2.5 h-2.5 text-text-tertiary/50" />
                    <span className="text-[9px] uppercase tracking-widest text-text-tertiary/60 font-semibold">
                      {group.phase}
                    </span>
                    <div className="flex-1 h-px bg-border-subtle/30" />
                  </div>
                )}
                <AnimatePresence>
                  {group.logs.map((log) => {
                    const style = LEVEL_STYLE[log.level] || LEVEL_STYLE.info
                    return (
                      <motion.div
                        key={log.id}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.12 }}
                        className="flex gap-2 py-0.5 hover:bg-white/[0.02] rounded px-1 -mx-1"
                      >
                        <span className="text-text-tertiary/40 shrink-0">{formatTs(log.timestamp)}</span>
                        <span className={`shrink-0 w-10 text-right ${AGENT_COLOR[log.agent] || 'text-text-tertiary'}`}>
                          {log.agent.slice(0, 4).toUpperCase()}
                        </span>
                        <span className={`shrink-0 w-3 text-center ${style.color}`}>
                          {style.icon}
                        </span>
                        <span className={`truncate ${log.level === 'error' ? 'text-red-300' : 'text-text-primary/80'}`}>
                          {log.message}
                        </span>
                      </motion.div>
                    )
                  })}
                </AnimatePresence>
              </div>
            ))}
          </div>
        )}
      </div>

      {!autoScroll && filtered.length > 0 && (
        <button
          onClick={() => {
            setAutoScroll(true)
            scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
          }}
          className="absolute bottom-2 right-4 px-2 py-1 rounded-md bg-surface-2/80 text-[10px] text-text-secondary border border-border-subtle hover:bg-surface-2 cursor-pointer"
        >
          ↓ Jump to latest
        </button>
      )}
    </div>
  )
}
