import { FileText, MessageSquare, RefreshCw, Ban, Lock, Shield } from 'lucide-react'
import type { Artifact, PhaseType, Task } from '../../types'
import { PHASE_META } from './phaseMeta'
import { getPhaseDisplayStatus, PHASE_STATUS_UI } from './phaseStatus'

export function PhaseMatrixCard({ phaseType, tasks, artifacts, currentPhase, iteration, isSelected, disabled, requirementStatus, requireApproval, qualityGate, onClick, t }: {
  phaseType: PhaseType; tasks: Task[]; artifacts: Artifact[]; currentPhase: PhaseType
  iteration: number; isSelected: boolean; disabled?: boolean
  requirementStatus?: string; requireApproval?: boolean; qualityGate?: string
  onClick: () => void; t: (k: any) => string
}) {
  const meta     = PHASE_META[phaseType]
  const status   = getPhaseDisplayStatus(phaseType, currentPhase, tasks, iteration, requirementStatus)
  const statusUi = PHASE_STATUS_UI[status]
  const done = tasks.filter(t2 => t2.status === 'completed').length

  const cardClass = disabled && !isSelected
    ? 'bg-surface-2/15 border-border-subtle opacity-50'
    : isSelected
      ? 'bg-accent/[0.07] border-accent/40 shadow-sm'
      : {
          active:             'bg-surface-2/40 border-accent/25 hover:border-accent/35',
          idle:               'bg-surface-2/40 border-warning/20 hover:border-border-default',
          completed:          'bg-surface-2/40 border-border-subtle hover:border-border-default',
          rework:             'bg-surface-2/40 border-warning/25 hover:border-border-default',
          pending:            'bg-surface-2/25 border-border-subtle hover:border-border-default',
          awaiting_approval:  'bg-warning/[0.06] border-warning/30 hover:border-warning/40',
        }[status]

  const iconColor = isSelected ? 'text-accent' : disabled ? 'text-text-tertiary' : status === 'active' ? 'text-accent' : status === 'completed' ? 'text-success' : status === 'awaiting_approval' ? 'text-warning' : status === 'pending' ? 'text-text-tertiary' : 'text-text-secondary'

  return (
    <button type="button" onClick={onClick} className={`relative text-left p-2.5 rounded-lg border transition-all cursor-pointer ${cardClass}`}>
      <div className="flex items-center gap-1 mb-1.5">
        <span className={`shrink-0 ${iconColor}`}>{meta.icon}</span>
        <span className={`text-[10px] font-semibold truncate ${isSelected ? 'text-accent' : disabled ? 'text-text-tertiary' : status === 'pending' ? 'text-text-tertiary' : 'text-text-secondary'}`}>
          {t(meta.labelKey)}
        </span>
        {isSelected && <MessageSquare className="w-2.5 h-2.5 text-accent ml-auto shrink-0" />}
        {!isSelected && disabled && (
          <span className="ml-auto flex items-center gap-0.5 text-[8px] font-semibold text-text-tertiary bg-surface-3 px-1 py-0.5 rounded">
            <Ban className="w-2 h-2" />{t('agentTeam.phaseDisabled')}
          </span>
        )}
        {!isSelected && !disabled && iteration > 1 && phaseType === currentPhase && (
          <span className="ml-auto flex items-center gap-0.5 text-[9px] font-bold text-warning bg-warning/10 px-1 py-0.5 rounded-full">
            <RefreshCw className="w-2 h-2" />×{iteration}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 mb-1.5">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${disabled && !isSelected ? 'bg-text-tertiary/30' : statusUi.dot}`} />
        <span className={`text-[9px] font-medium ${disabled && !isSelected ? 'text-text-tertiary' : statusUi.labelColor}`}>
          {disabled && !isSelected ? t('agentTeam.phaseDisabled') : t(statusUi.label)}
        </span>
        <span className="ml-auto text-[9px] font-mono text-text-tertiary">
          {tasks.length > 0 ? `${done}/${tasks.length}` : '—'}
        </span>
      </div>
      {/* Approval / quality gate indicators */}
      {!disabled && (requireApproval || qualityGate) && (
        <div className="flex items-center gap-1.5 mt-1">
          {requireApproval && (
            <span className="flex items-center gap-0.5 text-[8px] text-warning/80" title="Requires approval">
              <Lock className="w-2.5 h-2.5" />
            </span>
          )}
          {qualityGate && (
            <span className="flex items-center gap-0.5 text-[8px] text-text-tertiary" title={`Gate: ${qualityGate}`}>
              <Shield className="w-2.5 h-2.5" />
            </span>
          )}
        </div>
      )}
      {!isSelected && artifacts.length > 0 && (
        <div className="absolute top-2.5 right-2.5 flex items-center gap-0.5 text-[9px] text-text-tertiary">
          <FileText className="w-2.5 h-2.5" />{artifacts.length}
        </div>
      )}
    </button>
  )
}
