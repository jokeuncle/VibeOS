import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Terminal, Filter } from 'lucide-react'
import { useT } from '../i18n'
import type { Agent, AgentType } from '../types'
import type { TranslationKey } from '../i18n/en'

interface LogEntry {
  id: string
  timestamp: string
  agent: AgentType
  level: 'info' | 'warn' | 'error' | 'success'
  message: string
}

const LEVEL_COLOR: Record<string, string> = {
  info: 'text-blue-400',
  warn: 'text-yellow-400',
  error: 'text-red-400',
  success: 'text-emerald-400',
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

function generateMockLogs(): LogEntry[] {
  const logs: LogEntry[] = [
    { id: 'l1', timestamp: '14:23:01', agent: 'pm', level: 'info', message: 'Workspace initialized. Scanning requirements…' },
    { id: 'l2', timestamp: '14:23:02', agent: 'requirement', level: 'info', message: 'Parsing user stories from input. Found 3 epics, 12 stories.' },
    { id: 'l3', timestamp: '14:23:04', agent: 'requirement', level: 'success', message: 'Requirements analysis complete. Confidence: 94%' },
    { id: 'l4', timestamp: '14:23:05', agent: 'pm', level: 'info', message: 'Dispatching to Design Agent…' },
    { id: 'l5', timestamp: '14:23:06', agent: 'design', level: 'info', message: 'Generating wireframes for 5 screens…' },
    { id: 'l6', timestamp: '14:23:08', agent: 'design', level: 'warn', message: 'Mobile layout needs review — navigation depth > 3 levels.' },
    { id: 'l7', timestamp: '14:23:10', agent: 'architecture', level: 'info', message: 'Evaluating tech stack options: Next.js vs Remix…' },
    { id: 'l8', timestamp: '14:23:12', agent: 'architecture', level: 'success', message: 'Architecture decision: Next.js + Prisma + PostgreSQL' },
    { id: 'l9', timestamp: '14:23:13', agent: 'development', level: 'info', message: 'Scaffolding project structure…' },
    { id: 'l10', timestamp: '14:23:15', agent: 'development', level: 'info', message: 'Installing dependencies: 42 packages' },
    { id: 'l11', timestamp: '14:23:18', agent: 'testing', level: 'info', message: 'Generating test plan: 28 unit tests, 8 integration tests' },
    { id: 'l12', timestamp: '14:23:20', agent: 'cicd', level: 'info', message: 'Pipeline configured: build → test → staging → prod' },
    { id: 'l13', timestamp: '14:23:22', agent: 'development', level: 'error', message: 'TypeScript error in auth.service.ts:42 — type mismatch' },
    { id: 'l14', timestamp: '14:23:23', agent: 'development', level: 'info', message: 'Auto-fixing TypeScript error…' },
    { id: 'l15', timestamp: '14:23:24', agent: 'development', level: 'success', message: 'Error resolved. All type checks pass.' },
    { id: 'l16', timestamp: '14:23:26', agent: 'testing', level: 'info', message: 'Running test suite… 26/28 passed' },
    { id: 'l17', timestamp: '14:23:28', agent: 'testing', level: 'warn', message: '2 tests skipped: payment integration (mock not ready)' },
    { id: 'l18', timestamp: '14:23:30', agent: 'cicd', level: 'info', message: 'Building Docker image: anyos-web:0.2.1' },
    { id: 'l19', timestamp: '14:23:33', agent: 'cicd', level: 'success', message: 'Build complete. Image pushed to registry.' },
    { id: 'l20', timestamp: '14:23:35', agent: 'monitoring', level: 'info', message: 'Health checks configured. Alert rules: CPU > 80%, error rate > 1%' },
  ]
  return logs
}

const ALL_AGENTS: AgentType[] = ['pm', 'requirement', 'design', 'architecture', 'development', 'testing', 'cicd', 'monitoring']

export default function AgentLogStream({ agents }: { agents: Agent[] }) {
  const t = useT()
  const [filter, setFilter] = useState<AgentType | 'all'>('all')
  const [logs] = useState<LogEntry[]>(generateMockLogs)
  const [visibleCount, setVisibleCount] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (visibleCount >= logs.length) return
    const timer = setTimeout(() => {
      setVisibleCount((c) => Math.min(c + 1, logs.length))
    }, 150)
    return () => clearTimeout(timer)
  }, [visibleCount, logs.length])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [visibleCount])

  const filtered = logs.slice(0, visibleCount).filter((l) => filter === 'all' || l.agent === filter)

  return (
    <div className="rounded-xl border border-border-subtle overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-border-subtle bg-surface-1/30 flex items-center gap-2">
        <Terminal className="w-3.5 h-3.5 text-text-tertiary" />
        <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
          {t('agent.logStream')}
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
          {ALL_AGENTS.filter((a) => agents.some((ag) => ag.type === a)).map((type) => (
            <button
              key={type}
              onClick={() => setFilter(type)}
              className={`px-2 py-0.5 rounded text-[10px] font-mono cursor-pointer transition-colors ${
                filter === type ? 'bg-accent/10 text-accent' : 'text-text-tertiary hover:text-text-secondary'
              }`}
            >
              {type === 'cicd' ? 'CI/CD' : type.slice(0, 3).toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Log area */}
      <div
        ref={scrollRef}
        className="bg-[#0d0d11] p-3 h-64 overflow-y-auto font-mono text-[11px] leading-relaxed"
      >
        <AnimatePresence>
          {filtered.map((log) => (
            <motion.div
              key={log.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.15 }}
              className="flex gap-2 py-0.5 hover:bg-white/[0.02] rounded px-1 -mx-1"
            >
              <span className="text-text-tertiary/40 shrink-0">{log.timestamp}</span>
              <span className={`shrink-0 w-10 text-right ${AGENT_COLOR[log.agent]}`}>
                {log.agent === 'cicd' ? 'CI/CD' : log.agent.slice(0, 4).toUpperCase()}
              </span>
              <span className={`shrink-0 ${LEVEL_COLOR[log.level]}`}>
                {log.level === 'info' ? 'ℹ' : log.level === 'warn' ? '⚠' : log.level === 'error' ? '✕' : '✓'}
              </span>
              <span className="text-gray-300">{log.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
        {visibleCount < logs.length && (
          <motion.div
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1.2, repeat: Infinity }}
            className="text-accent mt-1"
          >
            ▊
          </motion.div>
        )}
      </div>
    </div>
  )
}
