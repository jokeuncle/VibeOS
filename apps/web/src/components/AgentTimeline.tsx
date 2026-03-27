import { motion } from 'framer-motion'
import { useT } from '../i18n'
import type { Agent, AgentType, AgentStatus } from '../types'
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
}

function generateTimeline(agent: AgentType): TimelineSegment[] {
  const patterns: Record<string, TimelineSegment[]> = {
    pm: [
      { status: 'running', start: 0, end: 15 },
      { status: 'idle', start: 15, end: 30 },
      { status: 'running', start: 30, end: 45 },
      { status: 'idle', start: 45, end: 60 },
      { status: 'running', start: 60, end: 75 },
      { status: 'waiting', start: 75, end: 100 },
    ],
    requirement: [
      { status: 'idle', start: 0, end: 5 },
      { status: 'running', start: 5, end: 25 },
      { status: 'idle', start: 25, end: 100 },
    ],
    design: [
      { status: 'idle', start: 0, end: 20 },
      { status: 'running', start: 20, end: 40 },
      { status: 'waiting', start: 40, end: 45 },
      { status: 'running', start: 45, end: 55 },
      { status: 'idle', start: 55, end: 100 },
    ],
    architecture: [
      { status: 'idle', start: 0, end: 30 },
      { status: 'running', start: 30, end: 50 },
      { status: 'idle', start: 50, end: 100 },
    ],
    development: [
      { status: 'idle', start: 0, end: 40 },
      { status: 'running', start: 40, end: 70 },
      { status: 'error', start: 70, end: 75 },
      { status: 'running', start: 75, end: 90 },
      { status: 'idle', start: 90, end: 100 },
    ],
    testing: [
      { status: 'idle', start: 0, end: 55 },
      { status: 'running', start: 55, end: 80 },
      { status: 'waiting', start: 80, end: 85 },
      { status: 'running', start: 85, end: 95 },
      { status: 'idle', start: 95, end: 100 },
    ],
    cicd: [
      { status: 'idle', start: 0, end: 75 },
      { status: 'running', start: 75, end: 90 },
      { status: 'idle', start: 90, end: 100 },
    ],
    monitoring: [
      { status: 'idle', start: 0, end: 85 },
      { status: 'running', start: 85, end: 100 },
    ],
  }
  return patterns[agent] || [{ status: 'idle' as AgentStatus, start: 0, end: 100 }]
}

const HOURS = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00']
const ALL_AGENTS: AgentType[] = ['pm', 'requirement', 'design', 'architecture', 'development', 'testing', 'cicd', 'monitoring']

export default function AgentTimeline({ agents }: { agents: Agent[] }) {
  const t = useT()
  const currentPercent = 72

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-1/30 overflow-hidden">
      <div className="px-4 py-3 border-b border-border-subtle">
        <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
          {t('agent.timeline')}
        </span>
      </div>

      <div className="p-4 overflow-x-auto">
        <div style={{ minWidth: 380 }}>
        {/* Time axis */}
        <div className="flex mb-1 ml-20">
          {HOURS.map((h, i) => (
            <span key={h} className="text-[9px] font-mono text-text-tertiary/50" style={{ width: `${100 / HOURS.length}%` }}>
              {h}
            </span>
          ))}
        </div>

        {/* Timeline tracks */}
        <div className="space-y-1.5">
          {ALL_AGENTS.map((type, i) => {
            const segments = generateTimeline(type)
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
                    style={{ left: `${currentPercent}%` }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-accent absolute -top-0.5 -left-[2.5px]" />
                  </motion.div>
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
              <span className="text-[10px] text-text-tertiary capitalize">{status}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5 ml-2">
            <div className="w-px h-3 bg-accent" />
            <span className="text-[10px] text-text-tertiary">Now</span>
          </div>
        </div>
        </div>
      </div>
    </div>
  )
}
