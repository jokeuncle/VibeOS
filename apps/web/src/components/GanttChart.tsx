import { motion } from 'framer-motion'
import { useT } from '../i18n'
import type { Phase, PhaseStatus } from '../types'
import type { TranslationKey } from '../i18n/en'

const STATUS_COLOR: Record<PhaseStatus, string> = {
  pending: 'var(--color-surface-3)',
  in_progress: '#6366f1',
  completed: '#22c55e',
}

const PHASE_OFFSET: Record<string, { start: number; duration: number }> = {
  requirement: { start: 0, duration: 10 },
  design: { start: 7, duration: 10 },
  architecture: { start: 14, duration: 8 },
  development: { start: 20, duration: 16 },
  testing: { start: 32, duration: 10 },
  deployment: { start: 40, duration: 6 },
  monitoring: { start: 44, duration: 12 },
}

const WEEKS = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8']

export default function GanttChart({ phases, startDate }: { phases: Phase[]; startDate?: string }) {
  const t = useT()
  const totalDays = 56
  const daysSinceStart = startDate
    ? Math.max(0, Math.min(totalDays, Math.floor((Date.now() - new Date(startDate).getTime()) / 86400000)))
    : 28

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-1/30 overflow-hidden">
      <div className="px-4 py-3 border-b border-border-subtle">
        <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
          {t('gantt.title')}
        </span>
      </div>

      <div className="p-4 overflow-x-auto">
        <div style={{ minWidth: 420 }}>
          {/* Week headers */}
          <div className="flex mb-2 ml-20">
            {WEEKS.map((w) => (
              <div key={w} className="text-[9px] font-mono text-text-tertiary/50" style={{ width: `${100 / WEEKS.length}%` }}>
                {w}
              </div>
            ))}
          </div>

          {/* Grid lines */}
          <div className="relative">
            <div className="absolute inset-0 ml-20 flex pointer-events-none">
              {WEEKS.map((w) => (
                <div key={w} className="border-l border-border-subtle/30" style={{ width: `${100 / WEEKS.length}%` }} />
              ))}
            </div>

            {/* Phase rows */}
            <div className="space-y-2 relative">
              {phases.map((phase, i) => {
                const offset = PHASE_OFFSET[phase.type] || { start: 0, duration: 10 }
                const leftPercent = (offset.start / totalDays) * 100
                const widthPercent = Math.min((offset.duration / totalDays) * 100, 100 - leftPercent)
                const taskCount = phase.tasks.length
                const completedTasks = phase.tasks.filter((t) => t.status === 'completed').length

                return (
                  <motion.div
                    key={phase.id}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05, duration: 0.3 }}
                    className="flex items-center gap-2"
                  >
                    <span className="w-[72px] text-right text-[9px] font-mono text-text-secondary shrink-0 truncate">
                      {t(`phase.${phase.type}` as TranslationKey)}
                    </span>

                    <div className="flex-1 h-7 relative overflow-hidden">
                      <motion.div
                        className="absolute h-full rounded-md flex items-center px-2 group cursor-default overflow-hidden"
                        style={{
                          left: `${leftPercent}%`,
                          width: `${widthPercent}%`,
                          backgroundColor: STATUS_COLOR[phase.status],
                          opacity: phase.status === 'pending' ? 0.6 : 1,
                        }}
                        initial={{ scaleX: 0, originX: 0 }}
                        animate={{ scaleX: 1 }}
                        transition={{ delay: i * 0.08 + 0.2, duration: 0.5, ease: 'easeOut' }}
                      >
                        {taskCount > 0 && phase.status !== 'pending' && (
                          <div
                            className="absolute inset-y-0 left-0 rounded-md bg-white/10"
                            style={{ width: `${(completedTasks / taskCount) * 100}%` }}
                          />
                        )}

                        <span className="text-[9px] font-mono text-white/80 relative z-10 whitespace-nowrap">
                          {taskCount > 0 ? `${completedTasks}/${taskCount}` : '—'}
                        </span>

                        {/* Tooltip */}
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 rounded bg-surface-3 border border-border-subtle text-[9px] text-text-primary whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg z-20">
                          {t(`phase.${phase.type}` as TranslationKey)} · {offset.duration}d
                        </div>
                      </motion.div>
                    </div>
                  </motion.div>
                )
              })}
            </div>

            {/* Today indicator */}
            <motion.div
              className="absolute top-0 bottom-0 w-px bg-accent/60 z-10"
              style={{ left: `calc(${((daysSinceStart / totalDays) * 100)}% + 80px)` }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
            >
              <div className="absolute -top-3 -left-2 text-[8px] font-mono text-accent bg-accent/10 px-1 rounded">
                Today
              </div>
            </motion.div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-4 ml-20">
            {(['completed', 'in_progress', 'pending'] as PhaseStatus[]).map((status) => (
              <div key={status} className="flex items-center gap-1.5">
                <div className="w-3 h-2 rounded-sm" style={{ backgroundColor: STATUS_COLOR[status] }} />
                <span className="text-[10px] text-text-tertiary capitalize">{status.replace('_', ' ')}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
