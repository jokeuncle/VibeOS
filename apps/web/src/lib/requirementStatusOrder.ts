import type { RequirementStatus } from '../types'

/** Kanban columns, graph swimlanes, and dashboard chips — keep one canonical order. */
export const REQUIREMENT_STATUS_ORDER: RequirementStatus[] = [
  'draft',
  'designing',
  'ready',
  'in_progress',
  'completed',
]
