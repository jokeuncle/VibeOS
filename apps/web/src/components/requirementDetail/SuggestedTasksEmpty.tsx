import { Plus } from 'lucide-react'
import type { PhaseType } from '../../types'
import { PHASE_EMPTY_ICON, PHASE_META, PHASE_SUGGESTED_TASKS } from './phaseMeta'

export function SuggestedTasksEmpty({ phase, reqTitle, sendNLP, t }: {
  phase: PhaseType; reqTitle: string
  sendNLP: (msg: string) => void; t: (k: any) => string
}) {
  const suggestions = PHASE_SUGGESTED_TASKS[phase]
  const phaseLabel  = t(PHASE_META[phase].labelKey)

  return (
    <div className="rounded-lg border border-dashed border-border-subtle/90 overflow-hidden bg-surface-2/15">
      <div className="py-6 text-center px-4 border-b border-border-subtle/50">
        <div className="w-10 h-10 rounded-xl bg-surface-2/80 border border-border-subtle flex items-center justify-center mx-auto mb-3 text-text-tertiary/50 [&_svg]:w-7 [&_svg]:h-7">
          {PHASE_EMPTY_ICON[phase]}
        </div>
        <p className="text-xs text-text-tertiary font-medium">{t('requirement.noTasks' as any)}</p>
        <p className="text-[11px] text-text-tertiary/50 mt-1">{t('phase.suggestHint' as any)}</p>
      </div>

      <div className="p-3">
        <p className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-2 px-1">{t('task.suggested' as any)}</p>
        <div className="grid grid-cols-2 gap-1.5">
          {suggestions.map((sug, i) => (
            <button
              key={i}
              type="button"
              onClick={() => sendNLP(`请为需求「${reqTitle}」的${phaseLabel}阶段创建以下任务：${t(sug.labelKey as any)}`)}
              className="flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-surface-2/40 border border-transparent hover:border-border-subtle transition-all cursor-pointer text-left group"
            >
              <span className="text-text-tertiary/60 group-hover:text-accent transition-colors shrink-0">{sug.icon}</span>
              <span className="text-[11px] text-text-secondary group-hover:text-text-primary transition-colors truncate leading-tight">
                {t(sug.labelKey as any)}
              </span>
              <Plus className="w-3 h-3 text-text-tertiary/30 group-hover:text-accent ml-auto shrink-0 transition-colors" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
