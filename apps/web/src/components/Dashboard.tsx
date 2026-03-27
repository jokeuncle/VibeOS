import { motion } from 'framer-motion'
import { useT } from '../i18n'
import type { Phase, Agent, PhaseStatus, AgentStatus } from '../types'
import type { TranslationKey } from '../i18n/en'

function DonutChart({ data }: { data: { value: number; color: string }[] }) {
  const total = data.reduce((a, d) => a + d.value, 0)
  if (total === 0) return <div className="w-28 h-28" />

  const radius = 42
  const circumference = 2 * Math.PI * radius
  let accumulated = 0

  return (
    <svg width="120" height="120" viewBox="0 0 120 120">
      {data.map((d, i) => {
        const dashLen = (d.value / total) * circumference
        const offset = -(accumulated * circumference) / total
        accumulated += d.value
        return (
          <circle
            key={i}
            cx="60" cy="60" r={radius}
            fill="none"
            stroke={d.color}
            strokeWidth="14"
            strokeDasharray={`${dashLen} ${circumference - dashLen}`}
            strokeDashoffset={offset}
            strokeLinecap="butt"
            transform="rotate(-90 60 60)"
          />
        )
      })}
      <text x="60" y="60" textAnchor="middle" dy="0.35em" fill="var(--color-text-primary)" fontSize="18" fontWeight="600" fontFamily="var(--font-mono)">
        {total}
      </text>
    </svg>
  )
}

function PhaseBar({ name, progress, status }: { name: string; progress: number; status: PhaseStatus }) {
  const statusColor = status === 'completed' ? 'bg-success' : status === 'in_progress' ? 'bg-accent' : 'bg-surface-4'

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-text-secondary w-24 truncate">{name}</span>
      <div className="flex-1 h-2 bg-surface-3 rounded-full overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${statusColor}`}
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>
      <span className="text-[10px] font-mono text-text-tertiary w-8 text-right">{progress}%</span>
    </div>
  )
}

export default function Dashboard({ phases, agents }: { phases: Phase[]; agents: Agent[] }) {
  const t = useT()

  const totalTasks = phases.reduce((a, p) => a + p.tasks.length, 0)
  const pending = phases.reduce((a, p) => a + p.tasks.filter((t) => t.status === 'pending').length, 0)
  const inProgress = phases.reduce((a, p) => a + p.tasks.filter((t) => t.status === 'in_progress').length, 0)
  const completed = phases.reduce((a, p) => a + p.tasks.filter((t) => t.status === 'completed').length, 0)

  const donutData = [
    { value: pending, color: 'var(--color-surface-4)' },
    { value: inProgress, color: 'var(--color-accent)' },
    { value: completed, color: 'var(--color-success)' },
  ]

  const agentsByStatus = (s: AgentStatus) => agents.filter((a) => a.status === s).length

  return (
    <div className="space-y-6">
      {/* Task distribution + stats */}
      <div className="grid grid-cols-2 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-xl border border-border-subtle bg-surface-1/30 p-5"
        >
          <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-4">
            {t('dashboard.taskDistribution')}
          </h4>
          <div className="flex items-center gap-6">
            <DonutChart data={donutData} />
            <div className="space-y-3">
              <LegendItem color="bg-surface-4" label={t('dashboard.pending')} value={pending} />
              <LegendItem color="bg-accent" label={t('dashboard.inProgress')} value={inProgress} />
              <LegendItem color="bg-success" label={t('dashboard.completed')} value={completed} />
              <div className="pt-2 border-t border-border-subtle">
                <span className="text-[10px] text-text-tertiary uppercase">{t('dashboard.totalTasks')}</span>
                <span className="text-sm font-semibold text-text-primary font-mono ml-2">{totalTasks}</span>
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-xl border border-border-subtle bg-surface-1/30 p-5"
        >
          <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-4">
            {t('dashboard.agentStatus')}
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <StatCard label={t('agent.status.running')} value={agentsByStatus('running')} color="text-accent" />
            <StatCard label={t('agent.status.idle')} value={agentsByStatus('idle')} color="text-text-tertiary" />
            <StatCard label={t('agent.status.waiting')} value={agentsByStatus('waiting')} color="text-warning" />
            <StatCard label={t('agent.status.error')} value={agentsByStatus('error')} color="text-danger" />
          </div>
        </motion.div>
      </div>

      {/* Phase progress */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-xl border border-border-subtle bg-surface-1/30 p-5"
      >
        <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-4">
          {t('dashboard.phaseProgress')}
        </h4>
        <div className="space-y-3">
          {phases.map((p) => {
            const nameKey = `phase.${p.type}` as TranslationKey
            return <PhaseBar key={p.id} name={t(nameKey)} progress={p.progress} status={p.status} />
          })}
        </div>
      </motion.div>
    </div>
  )
}

function LegendItem({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-2.5 h-2.5 rounded-sm ${color}`} />
      <span className="text-xs text-text-secondary">{label}</span>
      <span className="text-xs font-mono text-text-primary font-semibold ml-auto">{value}</span>
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg bg-surface-2/40 px-3 py-2.5">
      <span className={`text-xl font-semibold font-mono ${color}`}>{value}</span>
      <p className="text-[10px] text-text-tertiary mt-0.5">{label}</p>
    </div>
  )
}
