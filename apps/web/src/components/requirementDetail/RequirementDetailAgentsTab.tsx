import { motion } from 'framer-motion'
import { Network } from 'lucide-react'
import type { PhaseStatus, Workspace } from '../../types'
import type { TranslationKey } from '../../i18n/en'
import AgentTopology from '../AgentTopology'
import AgentLogStream from '../AgentLogStream'
import AgentTimeline from '../AgentTimeline'
import GanttChart from '../GanttChart'

type TFn = (k: any) => string

export function RequirementDetailAgentsTab({ workspace, t }: { workspace: Workspace; t: TFn }) {
  return (
    <div className="space-y-6 pt-4 mt-1 border-t border-border-subtle/70">
      <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
        <Network className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
        {t('requirement.detail.agentsSection' as TranslationKey)}
      </h3>
      <AgentTopology agents={workspace.agents} />
      {workspace.phases.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-xl border border-border-subtle bg-surface-1/30 p-5"
        >
          <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-4">
            {t('dashboard.phaseProgress')}
          </h4>
          <div className="space-y-3">
            {workspace.phases.map((p) => {
              const statusColor: Record<PhaseStatus, string> = {
                completed: 'bg-success',
                in_progress: 'bg-accent',
                pending: 'bg-surface-4',
              }
              return (
                <div key={p.id} className="flex items-center gap-3">
                  <span className="text-xs text-text-secondary w-24 truncate">
                    {t(`phase.${p.type}` as TranslationKey)}
                  </span>
                  <div className="flex-1 h-2 bg-surface-3 rounded-full overflow-hidden">
                    <motion.div
                      className={`h-full rounded-full ${statusColor[p.status]}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${p.progress}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                    />
                  </div>
                  <span className="text-[10px] font-mono text-text-tertiary w-8 text-right">{p.progress}%</span>
                </div>
              )
            })}
          </div>
        </motion.div>
      )}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <GanttChart phases={workspace.phases} startDate={workspace.createdAt} />
      </motion.div>
      <AgentTimeline agents={workspace.agents} />
      <AgentLogStream agents={workspace.agents} />
    </div>
  )
}
