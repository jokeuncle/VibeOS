import { motion } from 'framer-motion'
import { useT } from '../i18n'
import { useUIStore } from '../stores/ui'
import type { Phase, PhaseStatus, Task } from '../types'
import type { TranslationKey } from '../i18n/en'

interface BoardTask extends Task {
  phaseName: string
  phaseId: string
}

const COLUMNS: { status: PhaseStatus; key: TranslationKey; color: string }[] = [
  { status: 'pending', key: 'board.pending', color: 'border-text-tertiary/20' },
  { status: 'in_progress', key: 'board.inProgress', color: 'border-accent/30' },
  { status: 'completed', key: 'board.completed', color: 'border-success/30' },
]

export default function BoardView({ phases }: { phases: Phase[] }) {
  const t = useT()
  const { openTaskDetail } = useUIStore()

  const allTasks: BoardTask[] = phases.flatMap((p) =>
    p.tasks.map((task) => ({ ...task, phaseName: p.name, phaseId: p.id })),
  )

  return (
    <div className="grid grid-cols-3 gap-4">
      {COLUMNS.map((col) => {
        const tasks = allTasks.filter((t) => t.status === col.status)
        const phaseKey = `phase.${col.status === 'pending' ? 'pending' : col.status}` as TranslationKey
        return (
          <div key={col.status} className="space-y-2">
            <div className={`flex items-center gap-2 pb-2 border-b-2 ${col.color}`}>
              <span className="text-xs font-semibold text-text-secondary">{t(col.key)}</span>
              <span className="text-[10px] font-mono text-text-tertiary bg-surface-3 px-1.5 py-0.5 rounded-full">
                {tasks.length}
              </span>
            </div>

            <div className="space-y-2 min-h-[100px]">
              {tasks.map((task, i) => (
                <motion.div
                  key={task.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  onClick={() => openTaskDetail(task.phaseId, task.id)}
                  className="p-3 rounded-lg border border-border-subtle bg-surface-1/60 hover:bg-surface-2/60 hover:border-border-default cursor-pointer transition-all group"
                >
                  <p className={`text-xs font-medium leading-relaxed ${
                    task.status === 'completed' ? 'text-text-tertiary line-through' : 'text-text-primary'
                  }`}>
                    {task.title}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[9px] text-text-tertiary bg-surface-3 px-1.5 py-0.5 rounded font-mono">
                      {task.phaseName}
                    </span>
                    {task.assignedAgent && (
                      <span className="text-[9px] text-accent/60 bg-accent/5 px-1.5 py-0.5 rounded font-mono">
                        {task.assignedAgent}
                      </span>
                    )}
                  </div>
                </motion.div>
              ))}

              {tasks.length === 0 && (
                <div className="py-8 text-center text-[11px] text-text-tertiary/40">
                  —
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
