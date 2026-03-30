import { CheckCircle2, ChevronRight, Circle } from 'lucide-react'
import { translateSeedTaskCopy } from '../../lib/seedTaskI18n'
import type { PhaseType, Task } from '../../types'
import type { TranslationKey } from '../../i18n/en'
import { getTaskTypeInfo } from './phaseMeta'
import { PRIORITY_COLORS, TASK_STATUS_PILL } from './uiConstants'

export function PhaseTaskRow({ task, phase, onClick, t }: {
  task: Task; phase: PhaseType; onClick: () => void; t: (k: any) => string
}) {
  const taskCopy = translateSeedTaskCopy(task.title, task.description, t as (k: TranslationKey) => string)
  const typeInfo = getTaskTypeInfo(phase, task)
  const typeLabel = t(`task.type.${typeInfo.key}` as any)

  const avatarClass = task.status === 'completed'
    ? 'bg-success/10 text-success'
    : task.status === 'in_progress'
      ? 'bg-accent/10 text-accent'
      : 'bg-surface-3 text-text-tertiary'

  const avatarIcon = task.status === 'completed' ? (
    <CheckCircle2 className="w-3.5 h-3.5" />
  ) : task.status === 'in_progress' ? (
    <span className="w-3.5 h-3.5 rounded-full border-2 border-accent border-t-transparent animate-spin inline-block" />
  ) : (
    <Circle className="w-3.5 h-3.5 text-text-tertiary/50" />
  )

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex gap-2.5 group cursor-pointer rounded-lg -mx-1 px-1 py-1.5 hover:bg-surface-2/35 transition-colors text-left"
    >
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${avatarClass}`}>
        {avatarIcon}
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-md border shrink-0 ${typeInfo.color}`}>
                {typeInfo.icon}
                {typeLabel}
              </span>
              <span className={`px-1.5 py-0.5 text-[9px] font-medium rounded-md shrink-0 ${TASK_STATUS_PILL[task.status]}`}>
                {t(`task.status.${task.status}` as any)}
              </span>
              {task.priority && (
                <span className={`px-1.5 py-0.5 text-[9px] font-semibold rounded-md uppercase shrink-0 ${PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.p3}`}>
                  {task.priority}
                </span>
              )}
            </div>
            <p className="text-xs text-text-primary/90 font-medium leading-relaxed">{taskCopy.title}</p>
            {taskCopy.description && (
              <p className="text-xs text-text-tertiary line-clamp-2 leading-relaxed">{taskCopy.description}</p>
            )}
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-text-tertiary shrink-0 mt-1 opacity-0 group-hover:opacity-60 transition-opacity" />
        </div>
      </div>
    </button>
  )
}
