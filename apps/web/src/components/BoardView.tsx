import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { Pencil, Trash2 } from 'lucide-react'
import { useT } from '../i18n'
import { useUIStore } from '../stores/ui'
import { useWorkspaceStore } from '../stores/workspace'
import ContextMenu, { useContextMenu, type ContextMenuItem } from './ui/ContextMenu'
import type { Phase, PhaseStatus, Task, TaskPriority } from '../types'
import type { TranslationKey } from '../i18n/en'

interface BoardTask extends Task {
  phaseName: string
  phaseId: string
}

const COLUMNS: { status: PhaseStatus; key: TranslationKey; color: string; dot: string }[] = [
  { status: 'pending', key: 'board.pending', color: 'border-text-tertiary/20', dot: 'bg-text-tertiary/40' },
  { status: 'in_progress', key: 'board.inProgress', color: 'border-accent/30', dot: 'bg-accent' },
  { status: 'completed', key: 'board.completed', color: 'border-success/30', dot: 'bg-success' },
]

const PRIORITY_BADGE: Record<TaskPriority, { bg: string; text: string; label: TranslationKey }> = {
  p0: { bg: 'bg-red-500/10', text: 'text-red-400', label: 'priority.p0' },
  p1: { bg: 'bg-orange-500/10', text: 'text-orange-400', label: 'priority.p1' },
  p2: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', label: 'priority.p2' },
  p3: { bg: 'bg-blue-500/10', text: 'text-blue-400', label: 'priority.p3' },
}

const LABEL_DOT: Record<string, string> = {
  red: 'bg-red-400', orange: 'bg-orange-400', yellow: 'bg-yellow-400',
  green: 'bg-green-400', blue: 'bg-blue-400', purple: 'bg-purple-400',
}

function Column({ status, children, count, label, borderColor, dotColor }: {
  status: PhaseStatus
  children: React.ReactNode
  count: number
  label: string
  borderColor: string
  dotColor: string
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  return (
    <div ref={setNodeRef} className="space-y-2">
      <div className={`flex items-center gap-2 pb-2 border-b-2 ${borderColor} transition-colors`}>
        <div className={`w-2 h-2 rounded-full ${dotColor}`} />
        <span className="text-xs font-semibold text-text-secondary">{label}</span>
        <span className="text-[10px] font-mono text-text-tertiary bg-surface-3 px-1.5 py-0.5 rounded-full">
          {count}
        </span>
      </div>
      <div className={`space-y-2 min-h-[100px] rounded-lg p-1 transition-colors ${isOver ? 'bg-accent/5 ring-1 ring-accent/20' : ''}`}>
        {children}
        {count === 0 && (
          <div className="py-8 text-center text-[11px] text-text-tertiary/40">—</div>
        )}
      </div>
    </div>
  )
}

function DraggableCard({ task }: { task: BoardTask }) {
  const t = useT()
  const { openTaskDetail, showConfirm, addToast } = useUIStore()
  const { deleteTask, activeWorkspaceId } = useWorkspaceStore()
  const { menu, onContextMenu, closeMenu } = useContextMenu()
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${task.phaseId}:${task.id}`,
    data: { task },
  })

  const menuItems: ContextMenuItem[] = [
    { id: 'edit', label: t('task.edit'), icon: <Pencil className="w-3.5 h-3.5" />, onClick: () => openTaskDetail(task.phaseId, task.id) },
    { id: 'delete', label: t('task.delete'), icon: <Trash2 className="w-3.5 h-3.5" />, danger: true, onClick: () => {
      showConfirm({
        title: t('confirm.deleteTask'),
        message: t('confirm.deleteTaskMsg'),
        danger: true,
        onConfirm: () => {
          if (activeWorkspaceId) deleteTask(activeWorkspaceId, task.phaseId, task.id)
          addToast({ type: 'info', message: t('task.deleted') })
        },
      })
    }},
  ]

  return (
    <>
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        onClick={() => openTaskDetail(task.phaseId, task.id)}
        onContextMenu={onContextMenu}
        className={`p-3 rounded-lg border border-border-subtle bg-surface-1/60 hover:bg-surface-2/60 hover:border-border-default cursor-grab active:cursor-grabbing transition-all group ${
          isDragging ? 'opacity-30' : ''
        }`}
      >
        <TaskCardContent task={task} t={t} />
      </div>
      <AnimatePresence>
        {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={closeMenu} />}
      </AnimatePresence>
    </>
  )
}

function TaskCardContent({ task, t }: { task: BoardTask; t: (key: TranslationKey) => string }) {
  return (
    <>
      <div className="flex items-start gap-2">
        <p className={`text-xs font-medium leading-relaxed flex-1 ${
          task.status === 'completed' ? 'text-text-tertiary line-through' : 'text-text-primary'
        }`}>
          {task.title}
        </p>
        {task.priority && PRIORITY_BADGE[task.priority] && (
          <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${PRIORITY_BADGE[task.priority].bg} ${PRIORITY_BADGE[task.priority].text} shrink-0`}>
            {t(PRIORITY_BADGE[task.priority].label)}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 mt-2">
        <span className="text-[9px] text-text-tertiary bg-surface-3 px-1.5 py-0.5 rounded font-mono">
          {task.phaseName}
        </span>
        {task.assignedAgent && (
          <span className="text-[9px] text-accent/60 bg-accent/5 px-1.5 py-0.5 rounded font-mono">
            {task.assignedAgent}
          </span>
        )}
        {task.labels && task.labels.length > 0 && (
          <div className="flex items-center gap-0.5 ml-auto">
            {task.labels.map((c) => (
              <div key={c} className={`w-2 h-2 rounded-full ${LABEL_DOT[c] || 'bg-gray-400'}`} />
            ))}
          </div>
        )}
        {task.dueDate && (
          <span className="text-[9px] text-text-tertiary font-mono ml-auto">
            {new Date(task.dueDate).toLocaleDateString()}
          </span>
        )}
      </div>
    </>
  )
}

export default function BoardView({ phases }: { phases: Phase[] }) {
  const t = useT()
  const { updateTask, addActivity, activeWorkspaceId } = useWorkspaceStore()
  const [activeTask, setActiveTask] = useState<BoardTask | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const allTasks: BoardTask[] = phases.flatMap((p) =>
    p.tasks.map((task) => ({ ...task, phaseName: p.name, phaseId: p.id })),
  )

  function handleDragStart(event: DragStartEvent) {
    const task = event.active.data.current?.task as BoardTask | undefined
    if (task) setActiveTask(task)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveTask(null)
    const { active, over } = event
    if (!over || !activeWorkspaceId) return

    const compositeId = active.id as string
    const [phaseId, taskId] = compositeId.split(':')
    const newStatus = over.id as PhaseStatus

    const task = allTasks.find((t) => t.id === taskId && t.phaseId === phaseId)
    if (!task || task.status === newStatus) return

    updateTask(activeWorkspaceId, phaseId, taskId, { status: newStatus })
    addActivity(activeWorkspaceId, {
      type: 'task_updated',
      description: `"${task.title}" → ${newStatus}`,
    })
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-3 gap-4">
        {COLUMNS.map((col) => {
          const tasks = allTasks.filter((t) => t.status === col.status)
          return (
            <Column
              key={col.status}
              status={col.status}
              count={tasks.length}
              label={t(col.key)}
              borderColor={col.color}
              dotColor={col.dot}
            >
              {tasks.map((task) => (
                <DraggableCard key={`${task.phaseId}:${task.id}`} task={task} />
              ))}
            </Column>
          )
        })}
      </div>

      <DragOverlay>
        {activeTask && (
          <div className="p-3 rounded-lg border border-accent/30 bg-surface-1 shadow-xl drag-overlay w-56">
            <TaskCardContent task={activeTask} t={t} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
