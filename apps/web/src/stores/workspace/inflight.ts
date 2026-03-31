export const workspaceMessagesFetchInflight = new Map<string, Promise<void>>()

export let wsLoadGeneration = 0
export function bumpWsLoadGeneration(): number {
  wsLoadGeneration += 1
  return wsLoadGeneration
}
