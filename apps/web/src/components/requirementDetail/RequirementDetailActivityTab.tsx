import { useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Activity, Zap, FileText } from 'lucide-react'
import { useWorkspaceStore } from '../../stores/workspace'
import { ExecutionRow } from './ExecutionRow'
import type { AgentExecution, ActivityItem } from '../../types'
import type { TranslationKey } from '../../i18n/en'

type TFn = (k: any) => string

type TimelineEntry =
  | { kind: 'execution'; data: AgentExecution; ts: number }
  | { kind: 'event'; data: ActivityItem; ts: number }

function SystemEventRow({ event, t }: { event: ActivityItem; t: TFn }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg px-3 py-2 hover:bg-surface-2/35 transition-colors">
      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-surface-3 text-text-tertiary">
        <FileText className="w-3.5 h-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-text-secondary truncate">{event.description}</p>
      </div>
      <span className="text-[10px] text-text-tertiary shrink-0">
        {timeAgo(event.timestamp)}
      </span>
    </div>
  )
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return '<1m'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

export function RequirementDetailActivityTab({
  requirementId,
  t,
}: {
  requirementId: string
  t: TFn
}) {
  const executions = useWorkspaceStore((s) => s.executions)
  const fetchExecutions = useWorkspaceStore((s) => s.fetchExecutions)
  const workspace = useWorkspaceStore((s) => {
    const wsId = s.activeWorkspaceId
    return wsId ? s.workspaces.find((w) => w.id === wsId) : undefined
  })

  useEffect(() => {
    fetchExecutions(requirementId)
  }, [requirementId, fetchExecutions])

  const { running, history, timeline } = useMemo(() => {
    const relevant = executions.filter(
      (e) =>
        (e.requirementId === requirementId || (!e.requirementId && !requirementId)) &&
        !e.parentExecutionId,
    )

    const active: AgentExecution[] = []
    const past: AgentExecution[] = []

    for (const e of relevant) {
      if (e.status === 'running' || e.status === 'queued') {
        active.push(e)
      } else {
        past.push(e)
      }
    }

    const entries: TimelineEntry[] = past.map((e) => ({
      kind: 'execution' as const,
      data: e,
      ts: new Date(e.startedAt).getTime(),
    }))

    const activities = workspace?.activities ?? []
    for (const act of activities) {
      entries.push({
        kind: 'event' as const,
        data: act,
        ts: new Date(act.timestamp).getTime(),
      })
    }

    entries.sort((a, b) => b.ts - a.ts)

    return { running: active, history: past, timeline: entries }
  }, [executions, requirementId, workspace?.activities])

  const totalToday = useMemo(() => {
    const dayStart = new Date()
    dayStart.setHours(0, 0, 0, 0)
    return [...running, ...history].filter(
      (e) => new Date(e.startedAt).getTime() >= dayStart.getTime(),
    ).length
  }, [running, history])

  const isEmpty = running.length === 0 && timeline.length === 0

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      {!isEmpty && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-surface-2/40 border border-border-subtle"
        >
          <Activity className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
          {running.length > 0 && (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-accent">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              {running.length} {t('execution.running' as TranslationKey)}
            </span>
          )}
          {running.length > 0 && totalToday > 0 && (
            <span className="text-text-tertiary text-[10px]">·</span>
          )}
          {totalToday > 0 && (
            <span className="text-[11px] text-text-tertiary">
              {t('execution.todayCount' as TranslationKey).replace('{count}', String(totalToday))}
            </span>
          )}
        </motion.div>
      )}

      {/* Running executions */}
      {running.length > 0 && (
        <div className="space-y-2">
          {running.map((exec) => (
            <ExecutionRow key={exec.id} execution={exec} t={t} defaultExpanded />
          ))}
        </div>
      )}

      {/* Divider */}
      {running.length > 0 && timeline.length > 0 && (
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-border-subtle" />
          <span className="text-[10px] text-text-tertiary uppercase tracking-wider shrink-0">
            {t('execution.history' as TranslationKey)}
          </span>
          <div className="flex-1 h-px bg-border-subtle" />
        </div>
      )}

      {/* Unified timeline: executions + system events */}
      {timeline.length > 0 && (
        <div className="space-y-1.5">
          {timeline.map((entry) =>
            entry.kind === 'execution' ? (
              <ExecutionRow key={entry.data.id} execution={entry.data} t={t} />
            ) : (
              <SystemEventRow key={entry.data.id} event={entry.data} t={t} />
            ),
          )}
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-dashed border-border-default bg-surface-1/30 py-12 text-center"
        >
          <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mx-auto mb-3">
            <Zap className="w-5 h-5 text-accent" />
          </div>
          <p className="text-sm font-medium text-text-primary mb-1">
            {t('execution.empty.title' as TranslationKey)}
          </p>
          <p className="text-xs text-text-tertiary max-w-xs mx-auto leading-relaxed">
            {t('execution.empty.desc' as TranslationKey)}
          </p>
        </motion.div>
      )}
    </div>
  )
}
