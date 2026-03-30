import { motion } from 'framer-motion'
import {
  FileText, Palette, Blocks, Code2, FlaskConical,
  Rocket, Activity, Link2,
} from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspace'
import { useUIStore } from '../stores/ui'
import { useT } from '../i18n'
import type { Requirement, RequirementStatus, PhaseType } from '../types'
import type { ReactNode } from 'react'

const PHASE_ICON: Record<PhaseType, ReactNode> = {
  requirement: <FileText className="w-3 h-3" />,
  design: <Palette className="w-3 h-3" />,
  architecture: <Blocks className="w-3 h-3" />,
  development: <Code2 className="w-3 h-3" />,
  testing: <FlaskConical className="w-3 h-3" />,
  deployment: <Rocket className="w-3 h-3" />,
  monitoring: <Activity className="w-3 h-3" />,
}

const COLUMNS: { status: RequirementStatus; labelKey: string; headerClass: string; dotClass: string }[] = [
  { status: 'draft', labelKey: 'requirement.status.draft', headerClass: 'bg-surface-2', dotClass: 'bg-surface-4' },
  { status: 'in_progress', labelKey: 'requirement.status.in_progress', headerClass: 'bg-accent/5', dotClass: 'bg-accent' },
  { status: 'completed', labelKey: 'requirement.status.completed', headerClass: 'bg-success/5', dotClass: 'bg-success' },
]

function KanbanCard({ req, index }: { req: Requirement; index: number }) {
  const { setActiveRequirement } = useWorkspaceStore()
  const { setViewMode } = useUIStore()
  const t = useT()
  const progress = req.taskCount > 0 ? Math.round((req.doneCount / req.taskCount) * 100) : 0
  const relCount = req.relations?.length || 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.2 }}
      onClick={() => { setActiveRequirement(req.id); setViewMode('requirements') }}
      className="bg-surface-1 border border-border-subtle rounded-xl p-3 cursor-pointer hover:border-accent/30 hover:shadow-sm transition-all group"
    >
      <div className="flex items-start gap-2 mb-2">
        <h4 className="text-xs font-medium text-text-primary flex-1 line-clamp-2 leading-relaxed">
          {req.title}
        </h4>
        {req.priority && (
          <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-surface-3 text-text-secondary uppercase shrink-0">
            {req.priority}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 mb-2">
        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-2 text-text-tertiary">
          {PHASE_ICON[req.currentPhase]}
          <span className="text-[9px] font-medium">{t(`requirement.phase.${req.currentPhase}` as any)}</span>
        </div>
        {relCount > 0 && (
          <div className="flex items-center gap-0.5 text-text-tertiary">
            <Link2 className="w-2.5 h-2.5" />
            <span className="text-[9px] font-mono">{relCount}</span>
          </div>
        )}
      </div>

      {req.taskCount > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-mono text-text-tertiary">{req.doneCount}/{req.taskCount}</span>
            <span className="text-[9px] font-mono text-text-tertiary">{progress}%</span>
          </div>
          <div className="h-1 bg-surface-3 rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-accent/60"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.6, delay: index * 0.04 }}
            />
          </div>
        </div>
      )}
    </motion.div>
  )
}

export default function RequirementKanban() {
  const t = useT()
  const { workspaces, activeWorkspaceId } = useWorkspaceStore()
  const workspace = workspaces.find((w) => w.id === activeWorkspaceId)
  const requirements = workspace?.requirements || []

  return (
    <div className="grid grid-cols-3 gap-4">
      {COLUMNS.map(col => {
        const items = requirements.filter(r => r.status === col.status)
        return (
          <div key={col.status} className="flex flex-col min-h-[300px]">
            <div className={`flex items-center gap-2 px-3 py-2.5 rounded-t-xl ${col.headerClass}`}>
              <div className={`w-2 h-2 rounded-full ${col.dotClass}`} />
              <span className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide">
                {t(col.labelKey as any)}
              </span>
              <span className="text-[10px] font-mono text-text-tertiary ml-auto">{items.length}</span>
            </div>

            <div className="flex-1 space-y-2 p-2 bg-surface-1/50 rounded-b-xl border border-t-0 border-border-subtle overflow-y-auto max-h-[600px]">
              {items.map((req, i) => (
                <KanbanCard key={req.id} req={req} index={i} />
              ))}

              {items.length === 0 && (
                <div className="flex items-center justify-center py-8 text-[10px] text-text-tertiary">
                  {t('requirement.kanban.emptyColumn' as any)}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
