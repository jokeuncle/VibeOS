import { motion } from 'framer-motion'
import { Link2 } from 'lucide-react'
import type { PhaseType } from '../../types'
import type { TranslationKey } from '../../i18n/en'
import { PHASE_META } from './phaseMeta'
import type { RequirementDetailTab } from './types'

type TFn = (k: any) => string

export function RequirementDetailOverviewTab({
  currentPhase,
  currentPhaseTasksLen,
  currentPhaseDone,
  relationsCount,
  t,
  setDetailTab,
}: {
  currentPhase: PhaseType
  currentPhaseTasksLen: number
  currentPhaseDone: number
  relationsCount: number
  t: TFn
  setDetailTab: (tab: RequirementDetailTab) => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="rounded-xl border border-border-subtle bg-surface-1/30 p-5 space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <div className="mt-0.5 shrink-0 text-text-secondary [&_svg]:w-5 [&_svg]:h-5">
            {PHASE_META[currentPhase].icon}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
              {t('requirement.detail.currentPhase' as TranslationKey)}
            </p>
            <p className="text-sm font-semibold text-text-primary mt-1">{t(PHASE_META[currentPhase].labelKey)}</p>
            <p className="text-[11px] text-text-tertiary mt-0.5 tabular-nums font-mono">
              {currentPhaseTasksLen > 0
                ? `${currentPhaseDone}/${currentPhaseTasksLen}`
                : t('requirement.noTasks' as TranslationKey)}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setDetailTab('work')}
          className="shrink-0 px-3 py-2 text-xs font-medium rounded-lg bg-accent/15 text-accent hover:bg-accent/20 border border-accent/20 transition-colors cursor-pointer"
        >
          {t('requirement.detail.goToWork' as TranslationKey)}
        </button>
      </div>
      <p className="text-[11px] text-text-tertiary/80 leading-relaxed border-t border-border-subtle pt-4">
        {t('requirement.detail.overviewHint' as TranslationKey)}
      </p>
      {relationsCount > 0 && (
        <button
          type="button"
          onClick={() => setDetailTab('relations')}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-surface-2/40 border border-border-subtle hover:border-accent/25 text-left transition-colors cursor-pointer"
        >
          <Link2 className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
          <span className="text-xs text-text-secondary flex-1">{t('phase.tab.relations')}</span>
          <span className="text-[10px] font-mono text-text-tertiary tabular-nums">({relationsCount})</span>
        </button>
      )}
    </motion.div>
  )
}
