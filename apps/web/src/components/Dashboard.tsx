import { useId, useMemo } from 'react'
import { motion } from 'framer-motion'
import { LayoutDashboard } from 'lucide-react'
import { useT } from '../i18n'
import type { Phase, Agent, AgentStatus, RequirementStatus } from '../types'
import type { TranslationKey } from '../i18n/en'
import ActivityLog from './ActivityLog'
import SummaryPanel from './SummaryPanel'
import { useWorkspaceStore } from '../stores/workspace'
import { useRegisterNlpContext } from '../hooks/useNlpContext'
import type { NlpContextDescriptor } from '../lib/nlpContext'

/** Same order as RequirementGraph / RequirementList grouping — keep dashboard counts aligned. */
const REQUIREMENT_STATUS_ORDER: RequirementStatus[] = ['draft', 'designing', 'ready', 'in_progress', 'completed']

const REQ_CHIP_VALUE: Record<RequirementStatus, { emphasis: 'muted' | 'accentSoft' | 'warning' | 'accent' | 'success' }> = {
  draft: { emphasis: 'muted' },
  designing: { emphasis: 'accentSoft' },
  ready: { emphasis: 'warning' },
  in_progress: { emphasis: 'accent' },
  completed: { emphasis: 'success' },
}

function ProgressRing({ progress }: { progress: number }) {
  const gradientId = useId()
  const radius = 28
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (progress / 100) * circumference

  return (
    <svg width="72" height="72" className="transform -rotate-90" aria-hidden>
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
          <stop offset="100%" stopColor="var(--color-accent-hover)" />
        </linearGradient>
      </defs>
    </svg>
  )
}

function DonutChart({ data }: { data: { value: number; color: string }[] }) {
  const total = data.reduce((a, d) => a + d.value, 0)
  if (total === 0) return null

  const radius = 42
  const circumference = 2 * Math.PI * radius
  let accumulated = 0

  return (
    <svg width="120" height="120" viewBox="0 0 120 120" aria-hidden>
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
      <span className="text-xs font-mono text-text-primary font-semibold ml-auto tabular-nums">{value}</span>
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-2/40 px-3 py-2">
      <span className={`text-lg font-semibold font-mono tabular-nums ${color}`}>{value}</span>
      <p className="text-[10px] text-text-tertiary mt-0.5 leading-tight">{label}</p>
    </div>
  )
}

function ReqCountChip({ label, value, emphasis }: {
  label: string
  value: number
  emphasis: 'muted' | 'accentSoft' | 'warning' | 'accent' | 'success'
}) {
  const emphasisClass =
    emphasis === 'muted'
      ? 'text-text-tertiary'
      : emphasis === 'accentSoft'
        ? 'text-accent/90'
        : emphasis === 'warning'
          ? 'text-warning'
          : emphasis === 'accent'
            ? 'text-accent'
            : 'text-success'
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border-subtle bg-surface-2/40 px-2.5 py-1.5 text-[11px]">
      <span className="text-text-secondary">{label}</span>
      <span className={`font-mono font-semibold tabular-nums ${emphasisClass}`}>{value}</span>
    </span>
  )
}

export default function Dashboard({ phases, agents }: { phases: Phase[]; agents: Agent[] }) {
  const t = useT()
  const { workspaces, activeWorkspaceId } = useWorkspaceStore()
  const workspace = workspaces.find(w => w.id === activeWorkspaceId)
  const requirements = workspace?.requirements || []

  const nlpDesc: NlpContextDescriptor | null = activeWorkspaceId ? {
    id: 'view:dashboard',
    type: 'dashboard',
    priority: 10,
    label: workspace?.name || t('sidebar.dashboard'),
    agentType: 'pm',
    agentLabel: t('agent.name.pm'),
    contextPayload: { view: 'dashboard' },
    placeholderKey: 'command.placeholderNLP',
    intentHints: ['query_progress'],
  } : null
  useRegisterNlpContext(nlpDesc)

  const totalTasks = phases.reduce((a, p) => a + p.tasks.length, 0)
  const pending = phases.reduce((a, p) => a + p.tasks.filter((tk) => tk.status === 'pending').length, 0)
  const inProgress = phases.reduce((a, p) => a + p.tasks.filter((tk) => tk.status === 'in_progress').length, 0)
  const completed = phases.reduce((a, p) => a + p.tasks.filter((tk) => tk.status === 'completed').length, 0)

  const donutData = [
    { value: pending, color: 'var(--color-surface-4)' },
    { value: inProgress, color: 'var(--color-accent)' },
    { value: completed, color: 'var(--color-success)' },
  ]

  const agentsByStatus = (s: AgentStatus): number =>
    agents.filter((agent) => agent.status === s).length

  const requirementCounts = useMemo(() => {
    const counts: Record<RequirementStatus, number> = {
      draft: 0,
      designing: 0,
      ready: 0,
      in_progress: 0,
      completed: 0,
    }
    for (const r of requirements) {
      counts[r.status]++
    }
    return counts
  }, [requirements])

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <LayoutDashboard className="w-4 h-4 text-accent" />
          <h1 className="text-base font-semibold text-text-primary tracking-tight">
            {workspace?.name || t('dashboard.title')}
          </h1>
        </div>
        <p className="text-[12px] text-text-tertiary">
          {workspace?.description || t('dashboard.desc')}
        </p>
      </div>

      {workspace && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="rounded-xl border border-border-subtle bg-surface-1/30 overflow-hidden"
        >
          <div className="p-5 flex flex-col gap-6 sm:flex-row sm:items-stretch sm:gap-8">
            <div
              className="flex items-center gap-5 shrink-0"
              aria-label={`${t('dashboard.overallProgress' as TranslationKey)} ${workspace.progress}%`}
            >
              <div className="relative shrink-0">
                <ProgressRing progress={workspace.progress} />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="text-sm font-semibold text-text-primary font-mono tabular-nums">
                    {workspace.progress}
                    <span className="text-[10px] text-text-tertiary">%</span>
                  </span>
                </div>
              </div>
              <div className="hidden sm:flex flex-col justify-center min-w-0">
                <span className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
                  {t('dashboard.overallProgress' as TranslationKey)}
                </span>
                <span className="text-xs text-text-tertiary mt-1 tabular-nums">
                  {requirements.length} {t('view.requirements' as TranslationKey)}
                </span>
              </div>
            </div>

            <div className="hidden sm:block w-px bg-border-subtle shrink-0 self-stretch" aria-hidden />

            <div className="flex-1 min-w-0 flex flex-col justify-center gap-3">
              <span className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
                {t('dashboard.requirementsLabel' as TranslationKey)}
              </span>
              {requirements.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {REQUIREMENT_STATUS_ORDER.map((status) => (
                    <ReqCountChip
                      key={status}
                      label={t(`requirement.status.${status}` as TranslationKey)}
                      value={requirementCounts[status]}
                      emphasis={REQ_CHIP_VALUE[status].emphasis}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-text-tertiary leading-relaxed">
                  {t('dashboard.noRequirements' as TranslationKey)}
                </p>
              )}
            </div>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-xl border border-border-subtle bg-surface-1/30 p-5"
        >
          <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-4">
            {t('dashboard.taskDistribution')}
          </h4>
          {totalTasks === 0 ? (
            <p className="text-xs text-text-tertiary leading-relaxed py-2">
              {t('dashboard.tasksEmpty' as TranslationKey)}
            </p>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-8">
              <div className="shrink-0">
                <DonutChart data={donutData} />
              </div>
              <div className="space-y-3 w-full sm:flex-1 min-w-0">
                <LegendItem color="bg-surface-4" label={t('dashboard.pending')} value={pending} />
                <LegendItem color="bg-accent" label={t('dashboard.inProgress')} value={inProgress} />
                <LegendItem color="bg-success" label={t('dashboard.completed')} value={completed} />
                <div className="pt-2 border-t border-border-subtle flex items-baseline justify-between gap-2">
                  <span className="text-[10px] text-text-tertiary uppercase">{t('dashboard.totalTasks')}</span>
                  <span className="text-sm font-semibold text-text-primary font-mono tabular-nums">{totalTasks}</span>
                </div>
              </div>
            </div>
          )}
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
          <div className="grid grid-cols-2 gap-2.5">
            <StatCard label={t('agent.status.running')} value={agentsByStatus('running')} color="text-accent" />
            <StatCard label={t('agent.status.idle')} value={agentsByStatus('idle')} color="text-text-tertiary" />
            <StatCard label={t('agent.status.waiting')} value={agentsByStatus('waiting')} color="text-warning" />
            <StatCard label={t('agent.status.error')} value={agentsByStatus('error')} color="text-danger" />
          </div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <SummaryPanel />
      </motion.div>

      {workspace && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <ActivityLog activities={workspace.activities} />
        </motion.div>
      )}
    </div>
  )
}
