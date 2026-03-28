import { motion } from 'framer-motion'
import { FileText, RefreshCw, Zap, Bot, Settings } from 'lucide-react'
import { useT } from '../i18n'
import type { ActivityItem } from '../types'
import type { TranslationKey } from '../i18n/en'

const ICON_MAP: Record<string, { icon: typeof FileText; color: string }> = {
  task_created: { icon: FileText, color: 'text-accent bg-accent/10' },
  task_updated: { icon: RefreshCw, color: 'text-warning bg-warning/10' },
  phase_changed: { icon: Zap, color: 'text-success bg-success/10' },
  agent_action: { icon: Bot, color: 'text-violet-400 bg-violet-500/10' },
  workspace_updated: { icon: Settings, color: 'text-text-tertiary bg-surface-3' },
  workspace_created: { icon: Settings, color: 'text-accent bg-accent/10' },
  phase_status_changed: { icon: Zap, color: 'text-success bg-success/10' },
}

const DEFAULT_ICON = { icon: Settings, color: 'text-text-tertiary bg-surface-3' }

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

      <div className="divide-y divide-border-subtle max-h-[280px] overflow-y-auto">
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
                <p className="text-xs text-text-primary leading-relaxed">{act.description}</p>
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
