import { WORKSPACE_COLORS, type WorkspaceColor } from '../types'

/** Home grid card — icon tile */
export const WORKSPACE_CARD_BG: Record<WorkspaceColor, string> = {
  indigo: 'bg-indigo-500/10 border-indigo-500/15',
  emerald: 'bg-emerald-500/10 border-emerald-500/15',
  rose: 'bg-rose-500/10 border-rose-500/15',
  amber: 'bg-amber-500/10 border-amber-500/15',
  cyan: 'bg-cyan-500/10 border-cyan-500/15',
  violet: 'bg-violet-500/10 border-violet-500/15',
}

export const WORKSPACE_CARD_TEXT: Record<WorkspaceColor, string> = {
  indigo: 'text-indigo-400',
  emerald: 'text-emerald-400',
  rose: 'text-rose-400',
  amber: 'text-amber-400',
  cyan: 'text-cyan-400',
  violet: 'text-violet-400',
}

/** Top bar tab — active indicator (matches workspace accent) */
export const WORKSPACE_TAB_TOP: Record<WorkspaceColor, string> = {
  indigo: 'border-t-2 border-t-indigo-400',
  emerald: 'border-t-2 border-t-emerald-400',
  rose: 'border-t-2 border-t-rose-400',
  amber: 'border-t-2 border-t-amber-400',
  cyan: 'border-t-2 border-t-cyan-400',
  violet: 'border-t-2 border-t-violet-400',
}

/** Tab strip — small dot so inactive tabs still show workspace color */
export const WORKSPACE_TAB_DOT: Record<WorkspaceColor, string> = {
  indigo: 'bg-indigo-400',
  emerald: 'bg-emerald-400',
  rose: 'bg-rose-400',
  amber: 'bg-amber-400',
  cyan: 'bg-cyan-400',
  violet: 'bg-violet-400',
}

export function workspaceColorFallback(color: string | undefined): WorkspaceColor {
  if (color && WORKSPACE_COLORS.includes(color as WorkspaceColor)) return color as WorkspaceColor
  return 'indigo'
}
