import type { PhaseStatus, RelationType } from '../../types'

export const PRIORITY_COLORS: Record<string, string> = {
  p0: 'bg-danger/10 text-danger border border-danger/20',
  p1: 'bg-warning/10 text-warning border border-warning/20',
  p2: 'bg-accent/10 text-accent border border-accent/20',
  p3: 'bg-surface-3 text-text-tertiary border border-border-subtle',
}

export const TASK_STATUS_PILL: Record<PhaseStatus, string> = {
  pending: 'bg-surface-3 text-text-tertiary',
  in_progress: 'bg-accent/15 text-accent',
  completed: 'bg-success/15 text-success',
}

export const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-surface-4 text-text-secondary',
  designing: 'bg-accent/20 text-accent',
  ready: 'bg-success/20 text-success',
  in_progress: 'bg-accent/20 text-accent',
  completed: 'bg-success/20 text-success',
}

export const RELATION_TYPES: { value: RelationType; labelKey: string }[] = [
  { value: 'depends_on', labelKey: 'requirement.relation.depends_on' },
  { value: 'parent_of', labelKey: 'requirement.relation.parent_of' },
  { value: 'related_to', labelKey: 'requirement.relation.related_to' },
  { value: 'evolves_from', labelKey: 'requirement.relation.evolves_from' },
  { value: 'conflicts_with', labelKey: 'requirement.relation.conflicts_with' },
]
