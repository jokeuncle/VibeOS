import type { StoreApi } from 'zustand'
import { workspaceApi } from '../../../lib/api'
import type { WorkspaceState, LogEntry } from '../types'
import { executionLogsFetchInflight, executionLogsHydratedIds } from '../inflight'

type SetState = StoreApi<WorkspaceState>['setState']
type GetState = StoreApi<WorkspaceState>['getState']

export function buildLogsSlice(set: SetState, get: GetState) {
  return {
    executionLogs: {} as Record<string, LogEntry[]>,

    setExecutionLogs: (workspaceId: string, entries: LogEntry[]) => {
      if (!workspaceId) return
      set((s) => ({
        executionLogs: { ...s.executionLogs, [workspaceId]: entries },
      }))
    },

    appendExecutionLog: (workspaceId: string, entry: LogEntry) => {
      if (!workspaceId) return
      set((s) => ({
        executionLogs: {
          ...s.executionLogs,
          [workspaceId]: [...(s.executionLogs[workspaceId] || []), entry].slice(-500),
        },
      }))
    },

    fetchExecutionLogs: async (workspaceId?: string) => {
      const id = workspaceId ?? get().activeWorkspaceId
      if (!id || id.startsWith('ws-temp-')) return

      if (executionLogsHydratedIds.has(id)) return

      const inflight = executionLogsFetchInflight.get(id)
      if (inflight) return inflight

      const run = (async () => {
        try {
          const logsResp = await workspaceApi.listExecutionLogs(id, undefined, 200)
          const historicLogs: LogEntry[] = ((logsResp as any).data || []).map((l: any) => ({
            id: l.id,
            timestamp: l.timestamp,
            agent: l.agent,
            level: l.level as LogEntry['level'],
            message: l.message,
            taskId: l.taskId,
          }))
          get().setExecutionLogs(id, historicLogs)
          executionLogsHydratedIds.add(id)
        } catch (err) {
          console.error('Failed to fetch execution logs:', err)
        } finally {
          executionLogsFetchInflight.delete(id)
        }
      })()

      executionLogsFetchInflight.set(id, run)
      return run
    },
  } satisfies Pick<
    WorkspaceState,
    'executionLogs' | 'setExecutionLogs' | 'appendExecutionLog' | 'fetchExecutionLogs'
  >
}
