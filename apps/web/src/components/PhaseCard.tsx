import { motion } from 'framer-motion'
import { CheckCircle2, Circle, Loader2, ChevronDown, Plus, Trash2, Pencil } from 'lucide-react'
import { useState } from 'react'
import { useT } from '../i18n'
import { useUIStore } from '../stores/ui'
import { useWorkspaceStore } from '../stores/workspace'
import ContextMenu, { useContextMenu, type ContextMenuItem } from './ui/ContextMenu'
import type { Phase, PhaseStatus } from '../types'
import type { TranslationKey } from '../i18n/en'

function StatusIcon({ status }: { status: PhaseStatus }) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="w-4 h-4 text-success" />
    case 'in_progress':
      return <Loader2 className="w-4 h-4 text-accent animate-spin" style={{ animationDuration: '2s' }} />
    default:
      return <Circle className="w-4 h-4 text-text-tertiary/40" />
  }
}

const NEXT_STATUS: Record<PhaseStatus, PhaseStatus> = {
  pending: 'in_progress',
  in_progress: 'completed',
  completed: 'pending',
}

const STATUS_TOOLTIP: Record<PhaseStatus, TranslationKey> = {
  pending: 'phase.markInProgress',
  in_progress: 'phase.markCompleted',
  completed: 'phase.markPending',
}

export default function PhaseCard({ phase, index }: { phase: Phase; index: number }) {
  const t = useT()
  const [expanded, setExpanded] = useState(phase.status === 'in_progress')
  const [adding, setAdding] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const { activeWorkspaceId, addTask, deleteTask, updatePhaseStatus } = useWorkspaceStore()
  const { openTaskDetail, addToast, showConfirm } = useUIStore()

  const completedTasks = phase.tasks.filter((t) => t.status === 'completed').length
  const nameKey = `phase.${phase.type}` as TranslationKey
  const descKey = `phase.${phase.type}.desc` as TranslationKey
  const statusKey = `status.${phase.status}` as TranslationKey

  function handleAddTask() {
    if (!newTaskTitle.trim() || !activeWorkspaceId) return
    addTask(activeWorkspaceId, phase.id, newTaskTitle.trim())
    addToast({ type: 'success', message: t('task.created') })
    setNewTaskTitle('')
    setAdding(false)
  }

  function handleDeleteTask(taskId: string) {
    if (!activeWorkspaceId) return
    showConfirm({
      title: t('confirm.deleteTask'),
      message: t('confirm.deleteTaskMsg'),
      danger: true,
      onConfirm: () => {
        deleteTask(activeWorkspaceId!, phase.id, taskId)
        addToast({ type: 'info', message: t('task.deleted') })
      },
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.05, ease: 'easeOut' }}
      className={`rounded-xl border transition-all duration-200 overflow-hidden ${
        phase.status === 'in_progress'
          ? 'border-accent/20 bg-accent/[0.03]'
          : phase.status === 'completed'
            ? 'border-border-subtle bg-surface-1/40'
            : 'border-border-subtle bg-surface-1/20'
      }`}
    >
      <div className="w-full p-4 flex items-center gap-3">
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (!activeWorkspaceId) return
            updatePhaseStatus(activeWorkspaceId, phase.id, NEXT_STATUS[phase.status])
            addToast({ type: 'info', message: t('phase.statusUpdated') })
          }}
          title={t(STATUS_TOOLTIP[phase.status])}
          className="cursor-pointer hover:scale-110 transition-transform"
        >
          <StatusIcon status={phase.status} />
        </button>
        <div className="flex-1 text-left cursor-pointer" onClick={() => setExpanded(!expanded)}>
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium ${phase.status === 'pending' ? 'text-text-tertiary' : 'text-text-primary'}`}>
              {t(nameKey)}
            </span>
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md ${
              phase.status === 'completed' ? 'bg-success/10 text-success'
                : phase.status === 'in_progress' ? 'bg-accent/10 text-accent'
                  : 'bg-surface-3 text-text-tertiary'
            }`}>
              {t(statusKey)}
            </span>
          </div>
          <p className="text-xs text-text-tertiary mt-0.5">{t(descKey)}</p>
        </div>
        {phase.tasks.length > 0 && (
          <span className="text-[11px] font-mono text-text-tertiary mr-1">
            {completedTasks}/{phase.tasks.length}
          </span>
        )}
        <button
          onClick={() => setExpanded(!expanded)}
          className="cursor-pointer p-1 hover:bg-surface-3 rounded-lg transition-colors"
        >
          <ChevronDown className={`w-4 h-4 text-text-tertiary transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
        </button>
      </div>

      <motion.div
        initial={false}
        animate={{ height: expanded ? 'auto' : 0, opacity: expanded ? 1 : 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="overflow-hidden"
      >
        <div className="px-4 pb-4 space-y-1.5">
          <div className="h-px bg-border-subtle mb-2" />

          {phase.tasks.length === 0 && !adding && (
            <div className="py-4 text-center text-xs text-text-tertiary">
              {t('empty.title')}
            </div>
          )}

          {phase.tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              phaseId={phase.id}
              onOpen={() => openTaskDetail(phase.id, task.id)}
              onDelete={() => handleDeleteTask(task.id)}
              t={t}
            />
          ))}

          {/* Inline add */}
          {adding ? (
            <form
              onSubmit={(e) => { e.preventDefault(); handleAddTask() }}
              className="flex items-center gap-2 mt-1"
            >
              <input
                autoFocus
                type="text"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') { setAdding(false); setNewTaskTitle('') } }}
                placeholder={t('task.addPlaceholder')}
                className="flex-1 px-2.5 py-1.5 rounded-lg bg-surface-2 border border-border-default text-xs text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent/40"
              />
              <button type="submit" className="px-2.5 py-1.5 rounded-lg bg-accent text-white text-xs cursor-pointer hover:bg-accent-hover transition-colors">
                {t('task.save')}
              </button>
              <button type="button" onClick={() => { setAdding(false); setNewTaskTitle('') }} className="px-2.5 py-1.5 rounded-lg bg-surface-3 text-text-tertiary text-xs cursor-pointer hover:bg-surface-4 transition-colors">
                {t('task.cancel')}
              </button>
            </form>
          ) : (
            <button
              onClick={() => { setAdding(true); setExpanded(true) }}
              className="flex items-center gap-1.5 text-[11px] text-text-tertiary hover:text-accent cursor-pointer transition-colors py-1 mt-1"
            >
              <Plus className="w-3 h-3" />
              {t('task.add')}
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

function TaskRow({
  task,
  phaseId,
  onOpen,
  onDelete,
  t,
}: {
  task: { id: string; title: string; status: PhaseStatus; assignedAgent?: string }
  phaseId: string
  onOpen: () => void
  onDelete: () => void
  t: (key: TranslationKey) => string
}) {
  const { menu, onContextMenu, closeMenu } = useContextMenu()

  const menuItems: ContextMenuItem[] = [
    { id: 'edit', label: t('task.edit'), icon: <Pencil className="w-3.5 h-3.5" />, onClick: onOpen },
    { id: 'delete', label: t('task.delete'), icon: <Trash2 className="w-3.5 h-3.5" />, danger: true, onClick: onDelete },
  ]

  return (
    <>
      <div
        onContextMenu={onContextMenu}
        onClick={onOpen}
        className="flex items-center gap-2.5 py-1.5 px-2 rounded-lg hover:bg-surface-2/40 transition-colors group cursor-pointer"
      >
        <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${
          task.status === 'completed' ? 'border-success/50 bg-success/10'
            : task.status === 'in_progress' ? 'border-accent/50 bg-accent/10'
              : 'border-border-default'
        }`}>
          {task.status === 'completed' && <div className="w-1.5 h-1.5 rounded-full bg-success" />}
          {task.status === 'in_progress' && <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-glow" />}
        </div>
        <span className={`text-xs flex-1 ${
          task.status === 'completed' ? 'text-text-tertiary line-through'
            : task.status === 'in_progress' ? 'text-text-primary'
              : 'text-text-secondary'
        }`}>
          {task.title}
        </span>
        {task.assignedAgent && (
          <span className="text-[9px] font-mono text-accent/60 bg-accent/5 px-1.5 py-0.5 rounded">
            {task.assignedAgent}
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="opacity-0 group-hover:opacity-100 p-0.5 text-text-tertiary hover:text-danger transition-all cursor-pointer"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={closeMenu} />}
    </>
  )
}
