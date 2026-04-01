import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileStack, ChevronRight, Trash2, FileText, Blocks, Palette,
  Code2, FlaskConical, Rocket, Activity, CheckCircle2, Circle, FilePlus,
} from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspace'
import { useUIStore } from '../stores/ui'
import { useT } from '../i18n'
import type { TranslationKey } from '../i18n/en'
import type { Requirement, RequirementStatus } from '../types'
import type { PhaseType } from '../types'

const STATUS_COLORS: Record<RequirementStatus, { bar: string; pill: string }> = {
  draft:       { bar: 'bg-surface-4',   pill: 'bg-surface-3 text-text-tertiary' },
  designing:   { bar: 'bg-accent',      pill: 'bg-accent/15 text-accent' },
  ready:       { bar: 'bg-success',     pill: 'bg-success/15 text-success' },
  in_progress: { bar: 'bg-accent',      pill: 'bg-accent/15 text-accent' },
  completed:   { bar: 'bg-success',     pill: 'bg-success/15 text-success' },
}

const PRIORITY_COLORS: Record<string, string> = {
  p0: 'bg-danger/10 text-danger border-danger/20',
  p1: 'bg-warning/10 text-warning border-warning/20',
  p2: 'bg-accent/10 text-accent border-accent/20',
  p3: 'bg-surface-3 text-text-tertiary border-border-subtle',
}

const PHASE_ICONS: Partial<Record<PhaseType, React.ReactNode>> = {
  requirement:  <FileText className="w-3 h-3" />,
  architecture: <Blocks className="w-3 h-3" />,
  design:       <Palette className="w-3 h-3" />,
  development:  <Code2 className="w-3 h-3" />,
  testing:      <FlaskConical className="w-3 h-3" />,
  deployment:   <Rocket className="w-3 h-3" />,
  monitoring:   <Activity className="w-3 h-3" />,
}

const PHASE_LABEL_KEYS: Record<string, string> = {
  requirement: 'requirement.phase.requirement',
  architecture: 'requirement.phase.architecture',
  design: 'requirement.phase.design',
  development: 'requirement.phase.development',
  testing: 'requirement.phase.testing',
  deployment: 'requirement.phase.deployment',
  monitoring: 'requirement.phase.monitoring',
}

function RequirementCard({ req, index, onOpen, onDelete }: {
  req: Requirement
  index: number
  onOpen: () => void
  onDelete: () => void
}) {
  const t = useT()
  const statusConfig = STATUS_COLORS[req.status] || STATUS_COLORS.draft
  const progress = req.taskCount > 0 ? Math.round((req.doneCount / req.taskCount) * 100) : 0
  const phaseIcon = PHASE_ICONS[req.currentPhase as PhaseType]
  const phaseLabel = t(PHASE_LABEL_KEYS[req.currentPhase] as any || req.currentPhase)
  const isCompleted = req.status === 'completed'
  const isActive = req.status === 'in_progress'

  const avatarClass = isCompleted
    ? 'bg-success/10 text-success'
    : isActive
      ? 'bg-accent/10 text-accent'
      : 'bg-surface-3 text-text-tertiary'

  const avatarIcon = isCompleted ? (
    <CheckCircle2 className="w-3.5 h-3.5" />
  ) : isActive ? (
    <Circle className="w-3.5 h-3.5" />
  ) : (
    <FileStack className="w-3.5 h-3.5" />
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ delay: index * 0.04, duration: 0.2 }}
      onClick={onOpen}
      className="flex gap-2.5 group cursor-pointer rounded-lg -mx-1 px-1 py-1.5 hover:bg-surface-2/35 transition-colors"
    >
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${avatarClass}`}>
        {avatarIcon}
      </div>

      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="flex items-center gap-1.5 min-w-0">
                {phaseIcon && <span className="text-text-tertiary shrink-0">{phaseIcon}</span>}
                <span className="text-[11px] font-semibold text-text-secondary truncate">{phaseLabel}</span>
              </span>
              {req.taskCount > 0 && (
                <span className="text-[10px] text-text-tertiary/50 font-mono tabular-nums shrink-0">
                  {req.doneCount}/{req.taskCount}
                </span>
              )}
              <span className={`px-1.5 py-0.5 text-[9px] font-medium rounded-md shrink-0 ${statusConfig.pill}`}>
                {t(`requirement.status.${req.status}` as any)}
              </span>
              {req.priority && (
                <span className={`px-1.5 py-0.5 text-[9px] font-semibold rounded-md border uppercase shrink-0 ${PRIORITY_COLORS[req.priority] || PRIORITY_COLORS.p3}`}>
                  {req.priority}
                </span>
              )}
            </div>
            <h3 className="text-xs text-text-primary/90 font-medium leading-relaxed">{req.title}</h3>
            {req.description && (
              <p className="text-xs text-text-tertiary line-clamp-2 leading-relaxed">{req.description}</p>
            )}
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onDelete() }}
              className="p-1 rounded-md hover:bg-danger/10 hover:text-danger text-text-tertiary/60 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <div className="p-1 rounded-md bg-accent/10 text-accent">
              <ChevronRight className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>

        { req.taskCount > 0 && (
          <div className="h-0.5 bg-surface-3 rounded-full overflow-hidden">
            <motion.div
              className={`h-full rounded-full ${statusConfig.bar}`}
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.6, ease: 'easeOut', delay: index * 0.04 + 0.1 }}
            />
          </div>
        )}
      </div>
    </motion.div>
  )
}

export default function RequirementList() {
  const t = useT()
  const { workspaces, activeWorkspaceId, workspaceDetailReady, createRequirement, deleteRequirement, setActiveRequirement } = useWorkspaceStore()
  const { showConfirm, reqCreating, setReqCreating } = useUIStore()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  const workspace = workspaces.find(w => w.id === activeWorkspaceId)
  const requirements = workspace?.requirements || []

  useEffect(() => {
    return () => setReqCreating(false)
  }, [setReqCreating])

  const handleCreate = async () => {
    if (!activeWorkspaceId || !title.trim()) return
    try {
      await createRequirement(activeWorkspaceId, title.trim(), description.trim())
      setTitle('')
      setDescription('')
      setReqCreating(false)
    } catch {
      // Error is already logged in the store, keep form open for retry
    }
  }

  const handleCancel = () => {
    setTitle('')
    setDescription('')
    setReqCreating(false)
  }

  const handleDelete = (req: Requirement) => {
    showConfirm({
      title: t('requirement.deleteConfirmTitle' as any),
      message: t('requirement.deleteConfirmMsg' as any).replace('{title}', req.title),
      danger: true,
      onConfirm: () => activeWorkspaceId && deleteRequirement(activeWorkspaceId, req.id),
    })
  }

  // Group by status — include every RequirementStatus so no row is dropped
  const drafts = requirements.filter(r => r.status === 'draft')
  const designing = requirements.filter(r => r.status === 'designing')
  const ready = requirements.filter(r => r.status === 'ready')
  const inProgress = requirements.filter(r => r.status === 'in_progress')
  const completed = requirements.filter(r => r.status === 'completed')

  const groups = [
    { key: 'in_progress', items: inProgress, label: t('requirement.status.in_progress'), dot: 'bg-accent animate-pulse' },
    { key: 'designing', items: designing, label: t('requirement.status.designing'), dot: 'bg-accent/70' },
    { key: 'ready', items: ready, label: t('requirement.status.ready'), dot: 'bg-warning' },
    { key: 'draft', items: drafts, label: t('requirement.status.draft'), dot: 'bg-surface-4' },
    { key: 'completed', items: completed, label: t('requirement.status.completed'), dot: 'bg-success' },
  ].filter(g => g.items.length > 0)

  let globalIdx = 0

  if (!workspaceDetailReady && requirements.length === 0 && !reqCreating) {
    return (
      <div className="space-y-3 pt-1" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[4.5rem] rounded-xl border border-border-subtle/60 bg-surface-2/25 animate-pulse" />
        ))}
      </div>
    )
  }

  if (requirements.length === 0 && !reqCreating) {
    return null
  }

  return (
    <div className="space-y-5">
      {/* Create form */}
      <AnimatePresence mode="popLayout">
        {reqCreating && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="rounded-xl border border-border-subtle bg-surface-1/30 overflow-hidden">
              <div className="px-4 py-3 border-b border-border-subtle flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                  <FilePlus className="w-4 h-4 text-accent" />
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="text-xs font-medium text-text-secondary">{t('requirement.create')}</p>
                  <p className="text-[10px] text-text-tertiary mt-0.5 leading-snug">
                    {t('requirement.create.subtitle' as TranslationKey)}
                  </p>
                </div>
              </div>

              <div className="p-4 space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="req-create-title" className="block text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
                    {t('requirement.create.title' as TranslationKey)}
                  </label>
                  <input
                    id="req-create-title"
                    autoFocus
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleCreate()}
                    placeholder={t('requirement.create.placeholder.title')}
                    className="w-full rounded-lg bg-surface-2/40 border border-border-subtle px-3 py-2 text-xs text-text-primary placeholder:text-text-tertiary/80 focus:outline-none focus:ring-1 focus:ring-accent/35 focus:border-accent/30 transition-colors"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="req-create-desc" className="block text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
                    {t('requirement.create.description' as TranslationKey)}
                  </label>
                  <textarea
                    id="req-create-desc"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder={t('requirement.create.placeholder.desc')}
                    rows={3}
                    className="w-full rounded-lg bg-surface-2/40 border border-border-subtle px-3 py-2 text-xs text-text-primary placeholder:text-text-tertiary/80 focus:outline-none focus:ring-1 focus:ring-accent/35 focus:border-accent/30 resize-none min-h-[4.5rem] leading-relaxed transition-colors"
                  />
                </div>
              </div>

              <div className="px-4 py-3 border-t border-border-subtle flex flex-wrap items-center justify-end gap-2 bg-surface-2/20">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-3 py-1.5 rounded-md border border-border-subtle bg-surface-2/40 text-[11px] font-medium text-text-secondary hover:text-text-primary hover:bg-surface-2/70 transition-colors cursor-pointer"
                >
                  {t('task.cancel' as any)}
                </button>
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={!title.trim()}
                  className="px-3 py-1.5 rounded-md bg-accent hover:bg-accent/90 text-white text-[11px] font-medium disabled:opacity-40 disabled:pointer-events-none cursor-pointer transition-colors"
                >
                  {t('requirement.create')}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* List panel — empty state lives in WorkspaceView hero; omit shell when there are no rows */}
      {requirements.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.12 }}
          className="space-y-0"
        >
          <div>
            {groups.map((group) => (
              <div key={group.key} className="mb-5 last:mb-0">
                <div className="flex items-center gap-2 mb-3">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${group.dot}`} />
                  <span className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">
                    {group.label}
                  </span>
                  <span className="text-[10px] font-mono text-text-tertiary/60 tabular-nums">({group.items.length})</span>
                </div>
                <div className="space-y-1">
                  <AnimatePresence mode="popLayout">
                    {group.items.map((req) => {
                      const idx = globalIdx++
                      return (
                        <RequirementCard
                          key={req.id}
                          req={req}
                          index={idx}
                          onOpen={() => setActiveRequirement(req.id)}
                          onDelete={() => handleDelete(req)}
                        />
                      )
                    })}
                  </AnimatePresence>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  )
}
