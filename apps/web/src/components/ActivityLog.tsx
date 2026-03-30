import { motion } from 'framer-motion'
import {
  FileText,
  RefreshCw,
  Zap,
  Bot,
  Settings,
  ThumbsUp,
  GitMerge,
  FileBarChart,
  ClipboardList,
} from 'lucide-react'
import { useT } from '../i18n'
import type { ActivityItem } from '../types'
import type { TranslationKey } from '../i18n/en'

const ICON_MAP: Record<string, { icon: typeof FileText; color: string }> = {
  task_created: { icon: FileText, color: 'text-accent bg-accent/10' },
  task_updated: { icon: RefreshCw, color: 'text-warning bg-warning/10' },
  task_deleted: { icon: RefreshCw, color: 'text-danger bg-danger/10' },
  phase_changed: { icon: Zap, color: 'text-success bg-success/10' },
  phase_status_changed: { icon: Zap, color: 'text-success bg-success/10' },
  agent_action: { icon: Bot, color: 'text-violet-400 bg-violet-500/10' },
  workspace_updated: { icon: Settings, color: 'text-text-tertiary bg-surface-3' },
  workspace_created: { icon: Settings, color: 'text-accent bg-accent/10' },
  workspace_phases_reset: { icon: RefreshCw, color: 'text-warning bg-warning/10' },
  artifact_created: { icon: Bot, color: 'text-violet-400 bg-violet-500/10' },
  artifact_upserted: { icon: Bot, color: 'text-violet-400 bg-violet-500/10' },
  feedback_submitted: { icon: ThumbsUp, color: 'text-success bg-success/10' },
  feedback_received: { icon: ThumbsUp, color: 'text-success bg-success/10' },
  feedback_recorded: { icon: ThumbsUp, color: 'text-success bg-success/10' },
  agent_delegated: { icon: GitMerge, color: 'text-cyan-400 bg-cyan-500/10' },
  summary_created: { icon: FileBarChart, color: 'text-amber-400 bg-amber-500/10' },
  requirement_created: { icon: ClipboardList, color: 'text-accent bg-accent/10' },
  requirement_updated: { icon: ClipboardList, color: 'text-warning bg-warning/10' },
  requirement_deleted: { icon: ClipboardList, color: 'text-danger bg-danger/10' },
  requirement_relation_created: { icon: GitMerge, color: 'text-cyan-400 bg-cyan-500/10' },
  requirement_phase_reset: { icon: Zap, color: 'text-success bg-success/10' },
}

const DEFAULT_ICON = { icon: Settings, color: 'text-text-tertiary bg-surface-3' }

function agentDisplayName(agent: string, t: (k: TranslationKey) => string): string {
  const k = `agent.name.${agent}` as TranslationKey
  const v = t(k)
  return v === k ? agent : v
}

function relationDisplayName(rel: string, t: (k: TranslationKey) => string): string {
  const k = `requirement.relation.${rel}` as TranslationKey
  const v = t(k)
  return v === k ? rel : v
}

/** Localize server-originated activity descriptions where patterns are stable. */
function formatActivityDescription(act: ActivityItem, t: (k: TranslationKey) => string): string {
  const d = act.description
  const { type } = act

  if (type === 'requirement_phase_reset') {
    const m = d.match(/^Reset ([a-z_]+) phase for requirement (.+)$/i)
    if (m) {
      const phaseKey = `phase.${m[1]}` as TranslationKey
      let phaseLabel = t(phaseKey)
      if (phaseLabel === phaseKey) phaseLabel = m[1]
      return t('activity.detail.requirement_phase_reset').replace('{phase}', phaseLabel).replace('{id}', m[2])
    }
  }

  if (type === 'workspace_phases_reset' && d === 'All phase statuses and tasks reset to pending') {
    return t('activity.detail.workspace_phases_reset')
  }

  if (type === 'requirement_relation_created') {
    const m = d.match(/^(.+?) → (.+?) \((.+?)\)$/)
    if (m) {
      return t('activity.detail.requirement_relation')
        .replace('{source}', m[1].trim())
        .replace('{target}', m[2].trim())
        .replace('{relation}', relationDisplayName(m[3].trim(), t))
    }
  }

  if (type === 'feedback_recorded') {
    const m = d.match(/^(\w+) agent output from (\w+)$/i)
    if (m) {
      const action = m[1].toLowerCase()
      const detailKey = `activity.feedbackDetail.${action}` as TranslationKey
      const template = t(detailKey)
      if (template !== detailKey) {
        return template.replace('{agent}', agentDisplayName(m[2], t))
      }
    }
  }

  if (type === 'task_updated') {
    const m = d.match(/^(.+) \(claimed by (\w+)\)$/)
    if (m) {
      return t('activity.detail.task_claimed')
        .replace('{title}', m[1])
        .replace('{agent}', agentDisplayName(m[2], t))
    }
  }

  return d
}

function timeAgo(iso: string, t: (k: TranslationKey) => string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return t('time.justNow')
  if (mins < 60) return `${mins}${t('time.mAgo')}`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}${t('time.hAgo')}`
  return `${Math.floor(hrs / 24)}${t('time.dAgo')}`
}

export default function ActivityLog({ activities }: { activities: ActivityItem[] }) {
  const t = useT()

  if (activities.length === 0) {
    return (
      <div className="rounded-xl border border-border-subtle bg-surface-1/30 p-5 text-center">
        <p className="text-xs text-text-tertiary">{t('activity.empty')}</p>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 }}
      className="rounded-xl border border-border-subtle bg-surface-1/30 overflow-hidden"
    >
      <div className="px-4 py-3 border-b border-border-subtle">
        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
          {t('activity.title')}
        </span>
      </div>

      <div className="divide-y divide-border-subtle max-h-[480px] overflow-y-auto">
        {activities.map((act, i) => {
          const { icon: Icon, color } = ICON_MAP[act.type] || DEFAULT_ICON
          const typeKey = `activity.${act.type}` as TranslationKey
          return (
            <motion.div
              key={act.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.03 }}
              className="flex items-start gap-3 px-4 py-3"
            >
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${color}`}>
                <Icon className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-[10px] font-mono text-text-tertiary uppercase">{t(typeKey)}</span>
                <p className="text-xs text-text-primary leading-relaxed">
                  {formatActivityDescription(act, t)}
                </p>
              </div>
              <span className="text-[10px] font-mono text-text-tertiary shrink-0 mt-1">
                {timeAgo(act.timestamp, t)}
              </span>
            </motion.div>
          )
        })}
      </div>
    </motion.div>
  )
}
