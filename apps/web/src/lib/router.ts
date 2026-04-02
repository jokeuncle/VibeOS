/**
 * Lightweight URL ↔ store router.
 *
 * URL scheme:
 *   /                                     → Home (no workspace)
 *   /w/:workspaceId                       → Workspace, default view
 *   /w/:workspaceId/:viewSlug             → Specific view
 *   /w/:workspaceId/requirements/:reqId   → Requirement detail
 *
 * Query params:
 *   ?sub=kanban|graph       (requirements sub-view, omitted for default "list")
 *   ?phase=:phaseId         (selected pipeline phase)
 */

type ViewMode =
  | 'dashboard'
  | 'requirements'
  | 'pipeline'
  | 'agentTeam'
  | 'extensions'
  | 'controlCenter'
  | 'context'
  | 'execution'
  | 'budget'
  | 'settings'

const SLUG_TO_VIEW: Record<string, ViewMode> = {
  dashboard: 'dashboard',
  requirements: 'requirements',
  pipeline: 'pipeline',
  agents: 'agentTeam',
  extensions: 'extensions',
  context: 'context',
  execution: 'execution',
  budget: 'budget',
  settings: 'settings',
}

const VIEW_TO_SLUG: Record<string, string> = {
  dashboard: 'dashboard',
  requirements: 'requirements',
  pipeline: 'pipeline',
  agentTeam: 'agents',
  extensions: 'extensions',
  controlCenter: 'pipeline',
  context: 'context',
  execution: 'execution',
  budget: 'budget',
  settings: 'settings',
}

export interface RouteState {
  workspaceId: string | null
  viewMode: ViewMode
  requirementId: string | null
  reqSubView: 'list' | 'kanban' | 'graph'
  phaseId: string | null
}

export function parseURL(pathname: string, search: string): RouteState {
  const params = new URLSearchParams(search)
  const state: RouteState = {
    workspaceId: null,
    viewMode: 'requirements',
    requirementId: null,
    reqSubView: 'list',
    phaseId: null,
  }

  const segments = pathname.split('/').filter(Boolean)
  if (segments[0] !== 'w' || !segments[1]) return state

  state.workspaceId = segments[1]

  if (segments[2]) {
    state.viewMode = SLUG_TO_VIEW[segments[2]] ?? 'requirements'
    if (segments[2] === 'requirements' && segments[3]) {
      state.requirementId = segments[3]
    }
  }

  const sub = params.get('sub')
  if (sub === 'kanban' || sub === 'graph') state.reqSubView = sub

  const phase = params.get('phase')
  if (phase) state.phaseId = phase

  return state
}

export function buildURL(state: {
  workspaceId: string | null
  viewMode: string
  requirementId: string | null
  reqSubView: string
  phaseId: string | null
}): string {
  if (!state.workspaceId) return '/'

  const slug = VIEW_TO_SLUG[state.viewMode] ?? 'requirements'
  let path = `/w/${state.workspaceId}/${slug}`

  if (slug === 'requirements' && state.requirementId) {
    path += `/${state.requirementId}`
  }

  const params = new URLSearchParams()
  if (slug === 'requirements' && !state.requirementId && state.reqSubView !== 'list') {
    params.set('sub', state.reqSubView)
  }
  if (state.phaseId) params.set('phase', state.phaseId)

  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
}

/** Current location as a route-comparable string. */
export function currentURL(): string {
  return location.pathname + location.search
}
