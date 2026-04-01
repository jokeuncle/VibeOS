/**
 * NLP context abstraction: types, slash-command definitions, and resolution logic.
 *
 * Views register NlpContextDescriptor instances via the UI store; the
 * highest-priority descriptor drives CommandBar display and the backend
 * NLP payload.
 */

import type { TranslationKey } from '../i18n/en'

// ---------------------------------------------------------------------------
// Context types
// ---------------------------------------------------------------------------

export type NlpContextType =
  | 'home'
  | 'workspace'
  | 'dashboard'
  | 'requirement'
  | 'pipeline'
  | 'agent_team'
  | 'integrations'
  | 'extensions'
  | 'traces'
  | 'execution'
  | 'budget'
  | 'settings'
  | 'control_center'

export interface SlashCommand {
  cmd: string
  labelKey: TranslationKey
  /** Restrict to these context types; empty / undefined = global. */
  contexts?: NlpContextType[]
  agentHint?: string
}

export interface NlpContextDescriptor {
  /** Unique key, e.g. 'requirement:req-123' or 'view:pipeline'. */
  id: string
  type: NlpContextType
  /** Higher value wins when multiple descriptors coexist. */
  priority: number

  // -- Display --
  label: string
  sublabel?: string
  /** Icon key matching PHASE_ICONS / view-specific icons in CommandBar. */
  icon?: string

  // -- Agent hint --
  agentType?: string
  agentLabel?: string

  // -- Backend payload --
  contextPayload: Record<string, unknown>

  // -- Dynamic command / UX overrides --
  commands?: SlashCommand[]
  placeholderKey?: TranslationKey
  /** Intent names particularly relevant in this context (forwarded to backend). */
  intentHints?: string[]
}

// ---------------------------------------------------------------------------
// Default slash commands (available everywhere inside a workspace)
// ---------------------------------------------------------------------------

export const GLOBAL_COMMANDS: SlashCommand[] = [
  { cmd: '/create', labelKey: 'cmd.createTask' },
  { cmd: '/status', labelKey: 'cmd.changeStatus' },
  { cmd: '/assign', labelKey: 'cmd.assign' },
  { cmd: '/report', labelKey: 'cmd.report' },
]

export const HOME_COMMANDS: SlashCommand[] = [
  { cmd: '/create', labelKey: 'cmd.createTask', contexts: ['home'] },
]

export const PIPELINE_COMMANDS: SlashCommand[] = [
  { cmd: '/deploy', labelKey: 'cmd.deploy', contexts: ['pipeline'], agentHint: 'pm' },
  { cmd: '/review', labelKey: 'cmd.review', contexts: ['pipeline'], agentHint: 'pm' },
]

export const REQUIREMENT_COMMANDS: SlashCommand[] = [
  { cmd: '/review', labelKey: 'cmd.review', contexts: ['requirement'], agentHint: 'pm' },
  { cmd: '/deploy', labelKey: 'cmd.deploy', contexts: ['requirement'], agentHint: 'pm' },
]

// ---------------------------------------------------------------------------
// Resolution helpers
// ---------------------------------------------------------------------------

/** Pick the highest-priority descriptor from the stack. */
export function resolveActiveContext(
  stack: Map<string, NlpContextDescriptor>,
): NlpContextDescriptor | null {
  let best: NlpContextDescriptor | null = null
  for (const desc of stack.values()) {
    if (!best || desc.priority > best.priority) best = desc
  }
  return best
}

/** Merge global + view-specific slash commands, deduped by cmd string. */
export function resolveSlashCommands(
  active: NlpContextDescriptor | null,
  isHome: boolean,
): SlashCommand[] {
  const base = isHome ? HOME_COMMANDS : GLOBAL_COMMANDS
  const extra = active?.commands ?? []
  const seen = new Set<string>()
  const merged: SlashCommand[] = []
  for (const c of [...extra, ...base]) {
    if (!seen.has(c.cmd)) {
      seen.add(c.cmd)
      merged.push(c)
    }
  }
  return merged
}
