/**
 * Maps workspace-svc seed tasks (CreateRequirement → requirementAnalysisTasks)
 * to i18n. API stores fixed English strings; UI shows locale-aware copy unless
 * the user edited the description away from the catalog text.
 */

import type { TranslationKey } from '../i18n/en'

type SeedEntry = {
  title: TranslationKey
  description: TranslationKey
  enDescription: string
}

/** Keys = exact English title as returned by the API / stored in DB. */
export const SEED_TASK_I18N_BY_TITLE: Record<string, SeedEntry> = {
  'Requirement Clarification': {
    title: 'task.seed.req.clarify.title',
    description: 'task.seed.req.clarify.desc',
    enDescription:
      'Clarify raw requirements, resolve ambiguities, and confirm scope boundaries',
  },
  'Stakeholder & User Role Analysis': {
    title: 'task.seed.req.stakeholder.title',
    description: 'task.seed.req.stakeholder.desc',
    enDescription:
      'Identify stakeholders, define user personas, goals, and pain points',
  },
  'User Story Decomposition': {
    title: 'task.seed.req.stories.title',
    description: 'task.seed.req.stories.desc',
    enDescription: 'Break requirements into actionable user stories with priority levels',
  },
  'Acceptance Criteria Definition': {
    title: 'task.seed.req.acceptance.title',
    description: 'task.seed.req.acceptance.desc',
    enDescription:
      'Define Given/When/Then acceptance criteria for each user story',
  },
  'Non-functional Requirements & Constraints': {
    title: 'task.seed.req.nfr.title',
    description: 'task.seed.req.nfr.desc',
    enDescription:
      'Identify NFRs (performance, security, scalability) and technical/business constraints',
  },
  'PRD Document Generation': {
    title: 'task.seed.req.prd.title',
    description: 'task.seed.req.prd.desc',
    enDescription:
      'Generate comprehensive Product Requirements Document from all prior analysis',
  },
}

export function translateSeedTaskCopy(
  title: string,
  description: string | undefined,
  t: (key: TranslationKey) => string,
): { title: string; description: string } {
  const entry = SEED_TASK_I18N_BY_TITLE[title]
  if (!entry) {
    return { title, description: description ?? '' }
  }
  const rawDesc = description ?? ''
  const useCatalogDesc = rawDesc === '' || rawDesc === entry.enDescription
  return {
    title: t(entry.title),
    description: useCatalogDesc ? t(entry.description) : rawDesc,
  }
}
