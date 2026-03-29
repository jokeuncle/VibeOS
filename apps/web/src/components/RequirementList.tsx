import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, FileStack, ChevronRight, Trash2 } from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspace'
import { useUIStore } from '../stores/ui'
import { useT } from '../i18n'
import type { Requirement, RequirementStatus } from '../types'

const STATUS_COLORS: Record<RequirementStatus, string> = {
  draft: 'bg-surface-4 text-text-secondary',
  in_progress: 'bg-accent/20 text-accent',
  completed: 'bg-success/20 text-success',
}

const PHASE_LABELS: Record<string, string> = {
  requirement: 'requirement.phase.requirement',
  architecture: 'requirement.phase.architecture',
  design: 'requirement.phase.design',
  development: 'requirement.phase.development',
  testing: 'requirement.phase.testing',
  deployment: 'requirement.phase.deployment',
  monitoring: 'requirement.phase.monitoring',
}

export default function RequirementList() {
  const t = useT()
  const { workspaces, activeWorkspaceId, createRequirement, deleteRequirement, setActiveRequirement } = useWorkspaceStore()
  const { showConfirm } = useUIStore()
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  const workspace = workspaces.find(w => w.id === activeWorkspaceId)
  const requirements = workspace?.requirements || []

  const handleCreate = () => {
    if (!activeWorkspaceId || !title.trim()) return
    createRequirement(activeWorkspaceId, title.trim(), description.trim())
    setTitle('')
    setDescription('')
    setCreating(false)
  }

  const handleDelete = (req: Requirement) => {
    showConfirm({
      title: 'Delete Requirement',
      message: `Delete "${req.title}" and all its tasks and artifacts?`,
      danger: true,
      onConfirm: () => activeWorkspaceId && deleteRequirement(activeWorkspaceId, req.id),
    })
  }

  return (
    <div className="space-y-4">
      <AnimatePresence>
        {creating ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-surface-2 border border-border-subtle rounded-xl p-4 space-y-3"
          >
            <input
              autoFocus
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder={t('requirement.create.placeholder.title')}
              className="w-full bg-surface-3 border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder={t('requirement.create.placeholder.desc')}
              rows={3}
              className="w-full bg-surface-3 border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent resize-none"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setCreating(false)} className="px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary">
                Cancel
              </button>
              <button onClick={handleCreate} disabled={!title.trim()} className="px-3 py-1.5 text-xs bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-40">
                {t('requirement.create')}
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.button
            onClick={() => setCreating(true)}
            className="w-full flex items-center gap-2 px-4 py-3 text-sm text-text-secondary hover:text-text-primary bg-surface-2/50 hover:bg-surface-2 border border-dashed border-border-subtle hover:border-accent/40 rounded-xl transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t('requirement.create')}
          </motion.button>
        )}
      </AnimatePresence>

      {requirements.length === 0 && !creating && (
        <div className="text-center py-12 text-text-tertiary text-sm">
          <FileStack className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>{t('requirement.empty')}</p>
        </div>
      )}

      <div className="grid gap-3">
        <AnimatePresence>
          {requirements.map((req, i) => (
            <motion.div
              key={req.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => setActiveRequirement(req.id)}
              className="group bg-surface-2 hover:bg-surface-3/80 border border-border-subtle hover:border-accent/30 rounded-xl p-4 cursor-pointer transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-medium text-text-primary truncate">{req.title}</h3>
                    <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded-md ${STATUS_COLORS[req.status]}`}>
                      {t(`requirement.status.${req.status}` as any)}
                    </span>
                    {req.priority && (
                      <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-md bg-surface-4 text-text-secondary uppercase">
                        {req.priority}
                      </span>
                    )}
                  </div>
                  {req.description && (
                    <p className="text-xs text-text-tertiary line-clamp-2 mb-2">{req.description}</p>
                  )}
                  <div className="flex items-center gap-3 text-[11px] text-text-tertiary">
                    <span>{t(PHASE_LABELS[req.currentPhase] as any || req.currentPhase)}</span>
                    <span>{req.doneCount}/{req.taskCount} tasks</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(req) }}
                    className="p-1 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-danger transition-opacity"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <ChevronRight className="w-4 h-4 text-text-tertiary opacity-0 group-hover:opacity-60 transition-opacity" />
                </div>
              </div>
              {req.taskCount > 0 && (
                <div className="mt-3 h-1 bg-surface-4 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-accent/70 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${(req.doneCount / req.taskCount) * 100}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
