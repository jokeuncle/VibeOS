import type { PhaseType, Task } from '../../types'
import type { TranslationKey } from '../../i18n/en'
import { PHASE_ORDER, getTaskTypeInfo } from './phaseMeta'

export type PhaseDisplayStatus = 'pending' | 'active' | 'idle' | 'completed' | 'rework'

export const PHASE_STATUS_UI: Record<PhaseDisplayStatus, { dot: string; label: TranslationKey; labelColor: string }> = {
  pending:   { dot: 'bg-surface-4',            label: 'phase.status.pending',   labelColor: 'text-text-tertiary' },
  active:    { dot: 'bg-accent animate-pulse',  label: 'phase.status.active',    labelColor: 'text-accent' },
  idle:      { dot: 'bg-warning',              label: 'phase.status.idle',      labelColor: 'text-warning' },
  completed: { dot: 'bg-success',              label: 'phase.status.completed', labelColor: 'text-success' },
  rework:    { dot: 'bg-warning animate-pulse', label: 'phase.status.rework',    labelColor: 'text-warning' },
}

export const PHASE_CHECKLIST: Record<PhaseType, string[]> = {
  requirement:  ['task.check.req.roleGoalBenefit', 'task.check.req.ac', 'task.check.req.priority', 'task.check.req.estimation'],
  architecture: ['task.check.arch.context', 'task.check.arch.decision', 'task.check.arch.consequences', 'task.check.arch.reviewed'],
  design:       ['task.check.design.wireframe', 'task.check.design.hifi', 'task.check.design.reviewed', 'task.check.design.handoff'],
  development:  ['task.check.dev.impl', 'task.check.dev.unitTest', 'task.check.dev.reviewed', 'task.check.dev.docs'],
  testing:      ['task.check.test.written', 'task.check.test.passed', 'task.check.test.coverage', 'task.check.test.edgeCases'],
  deployment:   ['task.check.deploy.stagingOk', 'task.check.deploy.prodOk', 'task.check.deploy.rollback', 'task.check.deploy.notified'],
  monitoring:   ['task.check.mon.alert', 'task.check.mon.dashboard', 'task.check.mon.runbook', 'task.check.mon.sloSet'],
}

export type DrawerSection = { label: string; value: string; mono?: boolean }

export function getPhaseDrawerSections(phase: PhaseType, task: Task, t: (k: any) => string): DrawerSection[] {
  const typeInfo = getTaskTypeInfo(phase, task)
  const typeLabel = t(`task.type.${typeInfo.key}` as any)

  const base: DrawerSection[] = [
    { label: t('task.type.label' as any), value: typeLabel },
  ]
  if (task.assignedAgent) {
    base.push({ label: t('task.assignedAgent'), value: t(`agent.name.${task.assignedAgent}` as any) })
  }

  return base
}

export function getPhaseDisplayStatus(
  phaseType: PhaseType, currentPhase: PhaseType, tasks: Task[], iteration: number,
): PhaseDisplayStatus {
  const phaseIdx   = PHASE_ORDER.indexOf(phaseType)
  const currentIdx = PHASE_ORDER.indexOf(currentPhase)
  if (phaseIdx > currentIdx) return 'pending'
  const hasInProgress = tasks.some(t => t.status === 'in_progress')
  const allDone       = tasks.length > 0 && tasks.every(t => t.status === 'completed')
  if (phaseIdx < currentIdx) return 'completed'
  if (hasInProgress) return 'active'
  if (allDone && iteration > 1) return 'rework'
  if (allDone) return 'completed'
  return 'idle'
}
