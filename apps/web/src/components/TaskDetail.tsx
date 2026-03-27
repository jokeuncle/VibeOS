import { useState, useEffect } from 'react'
import { CheckCircle2, Circle, Loader2 } from 'lucide-react'
import SlideOver from './ui/SlideOver'
import { useUIStore } from '../stores/ui'
import { useWorkspaceStore } from '../stores/workspace'
import { useT } from '../i18n'
import type { PhaseStatus } from '../types'
import type { TranslationKey } from '../i18n/en'

const STATUSES: PhaseStatus[] = ['pending', 'in_progress', 'completed']

function StatusIcon({ status }: { status: PhaseStatus }) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="w-3.5 h-3.5 text-success" />
    case 'in_progress':
      return <Loader2 className="w-3.5 h-3.5 text-accent" />
    default:
      return <Circle className="w-3.5 h-3.5 text-text-tertiary" />
  }
}

export default function TaskDetail() {
  const t = useT()
  const { taskDetailOpen, taskDetailPhaseId, taskDetailTaskId, closeTaskDetail } = useUIStore()
  const { activeWorkspaceId, workspaces, updateTask } = useWorkspaceStore()
  const { addToast } = useUIStore()

  const workspace = workspaces.find((w) => w.id === activeWorkspaceId)
  const phase = workspace?.phases.find((p) => p.id === taskDetailPhaseId)
  const task = phase?.tasks.find((t) => t.id === taskDetailTaskId)

  const [title, setTitle] = useState('')
  const [status, setStatus] = useState<PhaseStatus>('pending')
  const [description, setDescription] = useState('')

  useEffect(() => {
    if (task) {
      setTitle(task.title)
      setStatus(task.status)
      setDescription(task.description || '')
    }
  }, [task])

  function handleSave() {
    if (!activeWorkspaceId || !taskDetailPhaseId || !taskDetailTaskId || !title.trim()) return
    updateTask(activeWorkspaceId, taskDetailPhaseId, taskDetailTaskId, {
      title: title.trim(),
      status,
      description,
    })
    addToast({ type: 'success', message: t('task.updated') })
    closeTaskDetail()
  }

  return (
    <SlideOver open={taskDetailOpen} onClose={closeTaskDetail} title={t('task.detail')}>
      {task && (
        <div className="space-y-6">
          {/* Title */}
          <div>
            <label className="text-xs font-medium text-text-tertiary mb-1.5 block">
              {t('task.title')}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-border-default text-sm text-text-primary outline-none focus:border-accent/40 transition-colors"
            />
          </div>

          {/* Status */}
          <div>
            <label className="text-xs font-medium text-text-tertiary mb-1.5 block">
              {t('task.status')}
            </label>
            <div className="flex gap-2">
              {STATUSES.map((s) => {
                const key = `status.${s}` as TranslationKey
                return (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border cursor-pointer transition-all ${
                      status === s
                        ? s === 'completed'
                          ? 'border-success/30 bg-success/10 text-success'
                          : s === 'in_progress'
                            ? 'border-accent/30 bg-accent/10 text-accent'
                            : 'border-border-strong bg-surface-3 text-text-primary'
                        : 'border-border-subtle bg-surface-1 text-text-tertiary hover:bg-surface-2'
                    }`}
                  >
                    <StatusIcon status={s} />
                    {t(key)}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Assigned Agent */}
          {task.assignedAgent && (
            <div>
              <label className="text-xs font-medium text-text-tertiary mb-1.5 block">
                {t('task.assignedAgent')}
              </label>
              <div className="px-3 py-2 rounded-lg bg-surface-2 border border-border-subtle text-xs text-accent font-mono">
                {task.assignedAgent}
              </div>
            </div>
          )}

          {/* Description */}
          <div>
            <label className="text-xs font-medium text-text-tertiary mb-1.5 block">
              {t('task.description')}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('task.descriptionPlaceholder')}
              rows={5}
              className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-border-default text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent/40 transition-colors resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleSave}
              className="flex-1 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium cursor-pointer transition-colors"
            >
              {t('task.save')}
            </button>
            <button
              onClick={closeTaskDetail}
              className="px-4 py-2 rounded-lg bg-surface-3 hover:bg-surface-4 text-text-secondary text-sm font-medium cursor-pointer transition-colors"
            >
              {t('task.cancel')}
            </button>
          </div>
        </div>
      )}
    </SlideOver>
  )
}
