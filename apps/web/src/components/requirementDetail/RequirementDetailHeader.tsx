import { motion } from 'framer-motion'
import {
  Sparkles, RotateCcw, Rocket, Check, SkipForward, RefreshCw, Undo2,
} from 'lucide-react'
import type { PhaseType, Requirement } from '../../types'
import type { TranslationKey } from '../../i18n/en'
import { PRIORITY_COLORS, STATUS_COLORS } from './uiConstants'

type TFn = (k: any) => string

export function RequirementDetailHeader({
  req,
  t,
  descExpanded,
  setDescExpanded,
  iteration,
  summaryLoading,
  workflowRunning,
  allCurrentDone,
  nextPhaseType,
  handleAISummary,
  handlePublish,
  handleUnpublish,
  handleAdvancePhase,
  resetRequirementPhase,
}: {
  req: Requirement
  t: TFn
  descExpanded: boolean
  setDescExpanded: (v: boolean | ((b: boolean) => boolean)) => void
  iteration: number
  summaryLoading: boolean
  workflowRunning: boolean
  allCurrentDone: boolean
  nextPhaseType: PhaseType | null
  handleAISummary: () => void
  handlePublish: () => void
  handleUnpublish: () => void
  handleAdvancePhase: () => void
  resetRequirementPhase: (reqId: string, phaseType: string) => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="rounded-xl border border-border-subtle bg-surface-1/30 p-5 space-y-4"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-semibold text-text-primary tracking-tight">{req.title}</h2>
          {req.description && (
            <div className="mt-1">
              <p className={`text-sm text-text-tertiary leading-relaxed ${descExpanded ? '' : 'line-clamp-2'}`}>{req.description}</p>
              {req.description.length > 96 && (
                <button
                  type="button"
                  onClick={() => setDescExpanded(e => !e)}
                  className="mt-1.5 text-[11px] font-medium text-accent hover:text-accent/90 transition-colors cursor-pointer"
                >
                  {descExpanded ? t('requirement.detail.collapseDesc') : t('requirement.detail.expandDesc')}
                </button>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
          {req.priority && <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md uppercase ${PRIORITY_COLORS[req.priority] || PRIORITY_COLORS.p3}`}>{req.priority}</span>}
          <span className={`px-2 py-0.5 text-[10px] font-medium rounded-md ${STATUS_COLORS[req.status] || STATUS_COLORS.draft}`}>{t(`requirement.status.${req.status}` as any)}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {(req.status === 'draft' || req.status === 'designing') && (
          <button type="button" onClick={handleAISummary} disabled={workflowRunning || summaryLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-40 cursor-pointer">
            {summaryLoading ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {t('requirement.run')}
          </button>
        )}
        {(req.status === 'ready' || req.status === 'in_progress') && (
          <button type="button" onClick={handleAISummary} disabled={workflowRunning || summaryLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-40 cursor-pointer">
            {summaryLoading ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Rocket className="w-3.5 h-3.5" />}
            {req.currentPhase === 'requirement' ? t('requirement.run') : t('requirement.continue')}
          </button>
        )}
        {(req.status === 'draft' || req.status === 'designing') && allCurrentDone && req.currentPhase === 'requirement' && (
          <button type="button" onClick={handlePublish} disabled={workflowRunning}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-success text-white rounded-lg hover:bg-success/90 transition-colors disabled:opacity-40 cursor-pointer">
            <Check className="w-3.5 h-3.5" />{t('requirement.publish' as any)}
          </button>
        )}
        {req.status === 'ready' && (
          <button type="button" onClick={handleUnpublish} disabled={workflowRunning}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-surface-3 hover:bg-surface-4 text-text-secondary rounded-lg transition-colors disabled:opacity-40 cursor-pointer">
            <Undo2 className="w-3.5 h-3.5" />{t('requirement.unpublish' as any)}
          </button>
        )}
        {allCurrentDone && nextPhaseType && (
          <button type="button" onClick={handleAdvancePhase}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-success/15 text-success rounded-lg hover:bg-success/20 transition-colors cursor-pointer">
            <SkipForward className="w-3.5 h-3.5" />{t('requirement.advance' as any)}
          </button>
        )}
        {(req.status === 'completed' || allCurrentDone) && (
          <button type="button" onClick={() => resetRequirementPhase(req.id, req.currentPhase)} disabled={workflowRunning}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-surface-3 hover:bg-surface-4 text-text-secondary rounded-lg transition-colors disabled:opacity-40 cursor-pointer">
            <RotateCcw className="w-3.5 h-3.5" />{t('requirement.reset')}
          </button>
        )}
        {iteration > 1 && (
          <span className="flex items-center gap-0.5 text-[10px] font-mono text-warning ml-auto">
            <RefreshCw className="w-3 h-3" /> ×{iteration}
          </span>
        )}
      </div>

      <div className="space-y-1.5 mt-4 pt-4 border-t border-border-subtle/60">
        <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
          <div>
            <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
              {t('requirement.detail.progressOverall' as TranslationKey)}
            </p>
            <p className="text-[10px] text-text-tertiary/80 mt-0.5 leading-snug">
              {t('requirement.detail.progressOverallSub' as TranslationKey)}
            </p>
          </div>
          <span className="text-[10px] font-mono text-text-tertiary tabular-nums shrink-0 sm:text-right">
            {req.doneCount}/{req.taskCount}
          </span>
        </div>
        <div className="flex-1 h-0.5 bg-surface-3 rounded-full overflow-hidden min-w-0">
          <motion.div className="h-full rounded-full bg-accent" initial={{ width: 0 }}
            animate={{ width: `${req.taskCount > 0 ? Math.round((req.doneCount / req.taskCount) * 100) : 0}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }} />
        </div>
      </div>
    </motion.div>
  )
}
