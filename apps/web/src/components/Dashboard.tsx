import { useId } from 'react'
import { motion } from 'framer-motion'
import { useT } from '../i18n'
import type { Phase, Agent, AgentStatus } from '../types'
import type { TranslationKey } from '../i18n/en'
import ActivityLog from './ActivityLog'
import { useWorkspaceStore } from '../stores/workspace'

function ProgressRing({ progress }: { progress: number }) {
  const gradientId = useId()
  const radius = 28
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (progress / 100) * circumference

  return (
    <svg width="72" height="72" className="transform -rotate-90">
      <circle cx="36" cy="36" r={radius} fill="none" stroke="var(--color-surface-3)" strokeWidth="3" />
      <motion.circle
        cx="36" cy="36" r={radius}
        fill="none" stroke={`url(#${gradientId})`} strokeWidth="3"
        strokeLinecap="round" strokeDasharray={circumference}
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 1, ease: 'easeOut', delay: 0.2 }}
      />
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="var(--color-accent)" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
    </svg>
  )
}

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

export default function Dashboard({ phases, agents }: { phases: Phase[]; agents: Agent[] }) {
  const t = useT()
  const { workspaces, activeWorkspaceId } = useWorkspaceStore()
  const workspace = workspaces.find(w => w.id === activeWorkspaceId)
  const requirements = workspace?.requirements || []

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

  const draftCount = requirements.filter(r => r.status === 'draft').length
  const inProgressReqs = requirements.filter(r => r.status === 'in_progress').length
  const completedReqs = requirements.filter(r => r.status === 'completed').length

  return (
    <div className="space-y-6">
      {/* Workspace header with progress ring */}
      {workspace && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex items-center gap-6"
        >
          <div className="relative">
            <ProgressRing progress={workspace.progress} />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm font-semibold text-text-primary font-mono">
                {workspace.progress}
                <span className="text-[10px] text-text-tertiary">%</span>
              </span>
            </div>
          </div>

          <div className="flex-1">
            <h2 className="text-xl font-semibold tracking-tight text-text-primary">
              {workspace.name || t('workspace.untitled')}
            </h2>
            {workspace.description && (
              <p className="text-sm text-text-tertiary mt-1">{workspace.description}</p>
            )}
            <div className="flex items-center gap-4 mt-2">
              <span className="text-[11px] font-mono text-text-tertiary">
                {requirements.length} {t('view.requirements' as TranslationKey)} · {draftCount} {t('requirement.status.draft')} / {inProgressReqs} {t('requirement.status.in_progress')} / {completedReqs} {t('requirement.status.completed')}
              </span>
            </div>
          </div>
        </motion.div>
      )}

      {/* Requirement Health — first business metric after workspace identity */}
      {requirements.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-xl border border-border-subtle bg-surface-1/30 p-5"
        >
          <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-4">
            {t('dashboard.requirementHealth' as TranslationKey)}
          </h4>
          <div className="grid grid-cols-3 gap-3">
            <StatCard label={t('requirement.status.draft')} value={draftCount} color="text-text-tertiary" />
            <StatCard label={t('requirement.status.in_progress')} value={inProgressReqs} color="text-accent" />
            <StatCard label={t('requirement.status.completed')} value={completedReqs} color="text-success" />
          </div>
        </motion.div>
      )}

      {/* Task distribution + Agent status */}
      <div className="grid grid-cols-2 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
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
          transition={{ delay: 0.2 }}
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

      {/* Activity Log */}
      {workspace && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <ActivityLog activities={workspace.activities} />
        </motion.div>
      )}
    </div>
  )
}
