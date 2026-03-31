import type { Message, Workspace } from '../../types'
import en from '../../i18n/en'
import zh from '../../i18n/zh'
import { useI18nStore } from '../../i18n'
import type { TranslationKey } from '../../i18n/en'
import { useUIStore } from '../ui'
import type { WorkspaceState } from './types'

export function tRaw(key: TranslationKey, vars?: Record<string, string>): string {
  const locale = useI18nStore.getState().locale
  let msg = (locale === 'zh' ? zh : en)[key] ?? key
  if (vars) Object.entries(vars).forEach(([k, v]) => { msg = msg.replace(`{${k}}`, v) })
  return msg
}

export function friendlyError(raw: string): string {
  if (/rate.?limit|too.?many|SetLimitExceeded|inference limit/i.test(raw)) {
    return tRaw('error.llmRateLimit')
  }
  if (/502|bad gateway|all models failed/i.test(raw)) {
    return tRaw('error.llmUnavailable')
  }
  if (/timeout|timed out/i.test(raw)) {
    return tRaw('error.timeout')
  }
  if (/network|fetch|ECONNREFUSED/i.test(raw)) {
    return tRaw('error.networkError')
  }
  if (/nodename nor servname|Name or service not known|agent.*unavailable/i.test(raw)) {
    const agentMatch = raw.match(/Agent (\w+) unavailable/i)
    const agentName = agentMatch?.[1] || ''
    return agentName
      ? tRaw('error.agentUnavailable', { name: agentName })
      : tRaw('error.agentUnavailableGeneric')
  }
  return raw
}

/**
 * Convert a unified workflow event (category:action format) into a chat Message.
 * @param eventType  e.g. "task:start", "phase:complete", "project:error"
 * @param data       event payload (phase, task_id, task_title, etc.)
 */
export function workflowEventToMessage(eventType: string, data: any): string | null {
  const t = tRaw
  type TK = TranslationKey
  const contentMap: Record<string, string | undefined> = {
    'phase:start': `${t('workflow.phaseStart' as TK)}: ${data.phase ?? ''}`,
    'phase:complete': `${t('workflow.phaseComplete' as TK)}: ${data.phase ?? ''} (${data.tasks_executed ?? 0})`,
    'phase:skip': `${t('workflow.phaseSkip' as TK)}: ${data.phase ?? ''} — ${data.reason ?? ''}`,
    'task:start': `${t('workflow.taskStart' as TK)}: ${data.task_title ?? ''}`,
    'task:complete': `${t('workflow.taskComplete' as TK)}: ${data.task_title ?? ''}`,
    'task:error': `${t('workflow.taskError' as TK)}: ${data.task_title ?? ''} — ${data.error ?? ''}`,
    'project:start': t('workflow.projectStart' as TK),
    'project:complete': t('workflow.projectComplete' as TK),
    'project:error': `${t('error.requestFailed' as TK)}: ${data.error ?? ''}`,
  }
  return contentMap[eventType] ?? null
}

export function safeParseRichBlocks(raw: unknown): import('../../types').RichBlock[] | undefined {
  if (!raw) return undefined
  if (typeof raw !== 'string') return raw as import('../../types').RichBlock[]
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

export function patchWorkspace(
  workspaces: Workspace[],
  id: string,
  fn: (w: Workspace) => Workspace,
): Workspace[] {
  return workspaces.map((w) => (w.id === id ? fn(w) : w))
}

export function mergeMessagesById(remoteOldestFirst: Message[], local: Message[]): Message[] {
  const map = new Map<string, Message>()
  for (const m of remoteOldestFirst) map.set(m.id, m)
  for (const m of local) map.set(m.id, m)
  return Array.from(map.values()).sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  )
}

/**
 * Build the NLP context payload sent to pm-agent.
 *
 * Reads the active NlpContextDescriptor from the context registry (new path)
 * and enriches with workspace-level metadata (repos, zero_requirements).
 * Falls back to the legacy `nlpContext` + `activePhaseId` for backward compat.
 */
export function buildNlpPhaseContext(get: () => WorkspaceState): Record<string, unknown> | undefined {
  const id = get().activeWorkspaceId
  if (!id) return undefined
  const ws = get().workspaces.find((w) => w.id === id)
  const uiState = useUIStore.getState()

  const activeDesc = uiState.activeNlpContext
  const descriptorPayload = activeDesc?.contextPayload ?? {}

  // Phase type: prefer descriptor payload, then legacy nlpContext, then active phase tab
  const legacyCtx = uiState.nlpContext
  const phaseId = get().activePhaseId
  const phase = ws?.phases.find((p) => p.id === phaseId)
  const activePhaseType =
    (descriptorPayload.phase_type as string | undefined)
    || legacyCtx?.phaseType
    || phase?.type

  const repos = ws?.repos ?? []
  const phaseRepos = repos.filter((r) =>
    !r.phaseTypes?.length || (activePhaseType && r.phaseTypes.includes(activePhaseType)),
  )
  const primary = phaseRepos.find((r) => r.isPrimary) ?? phaseRepos[0]

  const ctx: Record<string, unknown> = { ...descriptorPayload }

  if (activePhaseType && !ctx.phase_type) ctx.phase_type = activePhaseType
  if (legacyCtx?.agentType && !ctx.target_agent) ctx.target_agent = legacyCtx.agentType
  if (legacyCtx?.requirementId && !ctx.requirement_id) ctx.requirement_id = legacyCtx.requirementId

  // Forward context metadata for backend NLU prompt enrichment
  if (activeDesc) {
    ctx.ui_context_type = activeDesc.type
    if (activeDesc.intentHints?.length) ctx.intent_hints = activeDesc.intentHints
  }

  const reqCount = ws?.requirements?.length ?? 0
  if (get().workspaceDetailReady && reqCount === 0) ctx.zero_requirements = true

  if (phaseRepos.length) {
    ctx.gitlab_repos = phaseRepos.map((r) => ({
      projectId: r.projectId,
      projectName: r.projectName,
      gitlabUrl: r.gitlabUrl,
      role: r.role,
      isPrimary: r.isPrimary,
      branchDefault: r.branchDefault,
      branchStrategy: r.branchStrategy,
      credentialId: r.credentialId,
    }))
    if (primary) {
      ctx.gitlab_primary_project = primary.projectId
      ctx.gitlab_primary_url = primary.gitlabUrl
    }
  }
  return Object.keys(ctx).length ? ctx : undefined
}
