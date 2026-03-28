import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { useT } from '../i18n'
import { useWorkspaceStore, type AgentStatusEvent } from '../stores/workspace'
import type { Agent, AgentType, AgentStatus, WorkflowEvent } from '../types'
import type { TranslationKey } from '../i18n/en'

const STATUS_FILL: Record<AgentStatus, string> = {
  idle: 'var(--color-surface-3)',
  running: '#6366f1',
  waiting: '#f59e0b',
  error: '#ef4444',
}

interface TimelineSegment {
  status: AgentStatus
  start: number
  end: number
  detail?: string
}

function buildSegments(events: AgentStatusEvent[], agentType: string, windowStart: number, windowEnd: number): TimelineSegment[] {
  const agentEvents = events.filter((e) => e.agentType === agentType && e.timestamp >= windowStart)
  if (agentEvents.length === 0) {
    return [{ status: 'idle', start: 0, end: 100 }]
  }

  const span = windowEnd - windowStart
  if (span <= 0) return [{ status: 'idle', start: 0, end: 100 }]

  const segments: TimelineSegment[] = []
  let lastPct = 0
  let lastStatus: AgentStatus = 'idle'

  for (const ev of agentEvents) {
    const pct = Math.min(100, ((ev.timestamp - windowStart) / span) * 100)
    if (pct > lastPct) {
      segments.push({ status: lastStatus, start: lastPct, end: pct })
    }
    lastPct = pct
    lastStatus = ev.status
  }

  if (lastPct < 100) {
    segments.push({ status: lastStatus, start: lastPct, end: 100 })
  }

  return segments.filter((s) => s.end - s.start > 0.2)
}

function formatTime(ts: number) {
  const d = new Date(ts)
  return d.toLocaleTimeString(undefined, { hour12: false, hour: '2-digit', minute: '2-digit' })
}

const ALL_AGENTS: AgentType[] = ['pm', 'requirement', 'design', 'architecture', 'development', 'testing', 'cicd', 'monitoring']

const WORKFLOW_PHASES = ['requirement', 'architecture', 'design', 'development', 'testing', 'deployment', 'monitoring'] as const

function WorkflowProgress({ events }: { events: WorkflowEvent[] }) {
  const t = useT()
  const completedPhases = new Set(
    events.filter((e) => e.type === 'workflow:phase_complete').map((e) => e.phase)
  )
  const currentPhase = events.filter((e) => e.type === 'workflow:phase_start').map((e) => e.phase).pop()

  if (events.length === 0) return null

  return (
    <div className="px-4 py-3 border-b border-border-subtle">
      <div className="flex items-center gap-1">
        {WORKFLOW_PHASES.map((phase) => {
          const isCompleted = completedPhases.has(phase)
          const isCurrent = phase === currentPhase && !isCompleted
          return (
            <div
              key={phase}
              className={`flex-1 h-1.5 rounded-full transition-colors ${
                isCompleted ? 'bg-success' : isCurrent ? 'bg-accent animate-pulse' : 'bg-surface-3'
              }`}
              title={t(`phase.${phase}` as TranslationKey)}
            />
          )
        })}
      </div>
      <div className="flex justify-between mt-1.5">
        {WORKFLOW_PHASES.map((phase) => (
          <span key={phase} className="text-[8px] font-mono text-text-tertiary text-center" style={{ width: `${100/7}%` }}>
            {t(`phase.short.${phase}` as TranslationKey)}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function AgentTimeline({ agents }: { agents: Agent[] }) {
  const t = useT()
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const agentStatusHistory = useWorkspaceStore((s) => s.agentStatusHistory)
  const { workflowEvents } = useWorkspaceStore()

  const history = activeWorkspaceId ? agentStatusHistory[activeWorkspaceId] || [] : []
  const hasHistory = history.length > 0

  const { windowStart, windowEnd, timeLabels, nowPct } = useMemo(() => {
    const now = Date.now()
    if (!hasHistory) {
      const start = now - 30 * 60_000
      return {
        windowStart: start,
        windowEnd: now,
        timeLabels: Array.from({ length: 7 }, (_, i) => formatTime(start + (i * 30 * 60_000) / 6)),
        nowPct: 100,
      }
    }
    const earliest = Math.min(...history.map((e) => e.timestamp))
    const start = earliest - 60_000
    const end = Math.max(now, ...history.map((e) => e.timestamp)) + 60_000
    const span = end - start
    return {
      windowStart: start,
      windowEnd: end,
      timeLabels: Array.from({ length: 7 }, (_, i) => formatTime(start + (i * span) / 6)),
      nowPct: Math.min(100, ((now - start) / span) * 100),
    }
  }, [hasHistory, history])

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-1/30 overflow-hidden">
      <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
        <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
          {t('agent.timeline')}
        </span>
        {hasHistory && (
          <span className="text-[10px] font-mono text-text-tertiary">
            {history.length} {t('agent.timelineEvents' as TranslationKey)}
          </span>
        )}
      </div>

      <WorkflowProgress events={workflowEvents} />

      <div className="p-4 overflow-x-auto">
        <div style={{ minWidth: 380 }}>
        {/* Time axis */}
        <div className="flex mb-1 ml-20">
          {timeLabels.map((h, i) => (
            <span key={i} className="text-[9px] font-mono text-text-tertiary/50" style={{ width: `${100 / timeLabels.length}%` }}>
              {h}
            </span>
          ))}
        </div>

        {/* Timeline tracks */}
        <div className="space-y-1.5">
          {ALL_AGENTS.map((type, i) => {
            const segments = hasHistory
              ? buildSegments(history, type, windowStart, windowEnd)
              : [{ status: 'idle' as AgentStatus, start: 0, end: 100 }]
            const currentAgent = agents.find((a) => a.type === type)
            const currentStatus = currentAgent?.status || 'idle'

            return (
              <motion.div
                key={type}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04, duration: 0.3 }}
                className="flex items-center gap-3"
              >
                <span className="w-16 text-right text-[9px] font-mono text-text-tertiary shrink-0 truncate">
                  {t(`agent.name.${type}` as TranslationKey)}
                </span>

                <div className="flex-1 h-5 bg-surface-2 rounded-md overflow-hidden relative flex">
                  {segments.map((seg, si) => (
                    <motion.div
                      key={si}
                      className="h-full rounded-sm relative group"
                      style={{
                        width: `${seg.end - seg.start}%`,
                        backgroundColor: STATUS_FILL[seg.status],
                      }}
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ delay: i * 0.04 + si * 0.06, duration: 0.3 }}
                    >
                      {seg.status !== 'idle' && (
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-[8px] font-mono text-white/80 capitalize">{seg.status}</span>
                        </div>
                      )}
                    </motion.div>
                  ))}

                  {/* Current time indicator */}
                  <motion.div
                    className="absolute top-0 bottom-0 w-px bg-accent z-10"
                    style={{ left: `${nowPct}%` }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-accent absolute -top-0.5 -left-[2.5px]" />
                  </motion.div>

                  {/* Live status indicator on the right edge */}
                  {currentStatus === 'running' && (
                    <motion.div
                      className="absolute right-0 top-0 bottom-0 w-1 rounded-r-sm"
                      style={{ backgroundColor: STATUS_FILL.running }}
                      animate={{ opacity: [1, 0.3, 1] }}
                      transition={{ duration: 1.2, repeat: Infinity }}
                    />
                  )}
                </div>
              </motion.div>
            )
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-4 ml-20 flex-wrap">
          {(['running', 'waiting', 'error', 'idle'] as AgentStatus[]).map((status) => (
            <div key={status} className="flex items-center gap-1.5">
              <div className="w-3 h-2 rounded-sm" style={{ backgroundColor: STATUS_FILL[status] }} />
              <span className="text-[10px] text-text-tertiary">{t(`agent.status.${status}` as TranslationKey)}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5 ml-2">
            <div className="w-px h-3 bg-accent" />
            <span className="text-[10px] text-text-tertiary">{t('agent.timelineNow' as TranslationKey)}</span>
          </div>
          {!hasHistory && (
            <span className="text-[10px] text-text-tertiary/50 italic ml-2">
              {t('agent.noLogs' as TranslationKey)}
            </span>
          )}
        </div>
        </div>
      </div>
    </div>
  )
}
