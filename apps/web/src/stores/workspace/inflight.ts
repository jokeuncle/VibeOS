/** Per workspace: execution log history has been loaded from the API this SPA session. */
export const executionLogsHydratedIds = new Set<string>()
export const executionLogsFetchInflight = new Map<string, Promise<void>>()
export const workspaceMessagesFetchInflight = new Map<string, Promise<void>>()

export let wsLoadGeneration = 0
export function bumpWsLoadGeneration(): number {
  wsLoadGeneration += 1
  return wsLoadGeneration
}
