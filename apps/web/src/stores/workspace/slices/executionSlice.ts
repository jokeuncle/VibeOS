import type { StoreApi } from 'zustand'
import type { AgentExecution, ExecutionStatus, ExecutionStep } from '../../../types'
import type { WorkspaceState } from '../types'
import { workspaceApi } from '../../../lib/api'

type SetState = StoreApi<WorkspaceState>['setState']
type GetState = StoreApi<WorkspaceState>['getState']

const MAX_EXECUTIONS = 200

function normalizeExec(e: AgentExecution): AgentExecution {
  const raw = (e as { steps?: ExecutionStep[] | string | null }).steps
  let steps: ExecutionStep[] = []
  if (Array.isArray(raw)) steps = raw
  else if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) steps = parsed as ExecutionStep[]
    } catch {
      /* keep empty */
    }
  }
  return {
    ...e,
    taskIds: e.taskIds ?? [],
    steps,
  }
}

export function buildExecutionSlice(set: SetState, get: GetState) {
  return {
    executions: [] as AgentExecution[],

    upsertExecution: (exec: AgentExecution) => {
      const normalized = normalizeExec(exec)
      set((s) => {
        const idx = s.executions.findIndex((e) => e.id === normalized.id)
        if (idx !== -1) {
          const updated = [...s.executions]
          updated[idx] = { ...updated[idx], ...normalized }
          return { executions: updated }
        }
        return { executions: [normalized, ...s.executions].slice(0, MAX_EXECUTIONS) }
      })
    },

    patchExecutionStatus: (
      executionId: string,
      status: ExecutionStatus,
      extra?: Partial<Pick<AgentExecution, 'errorMessage' | 'completedAt' | 'resultPayload'>>,
    ) => {
      set((s) => ({
        executions: s.executions.map((e) =>
          e.id === executionId
            ? {
                ...e,
                status,
                ...extra,
                ...(status === 'success' || status === 'failed' || status === 'cancelled'
                  ? { completedAt: extra?.completedAt ?? new Date().toISOString() }
                  : {}),
              }
            : e,
        ),
      }))
    },

    patchExecutionStep: (executionId: string, step: ExecutionStep) => {
      set((s) => ({
        executions: s.executions.map((e) => {
          if (e.id !== executionId) return e
          const existing = e.steps.findIndex((st) => st.id === step.id)
          const steps =
            existing !== -1
              ? e.steps.map((st, i) => (i === existing ? { ...st, ...step } : st))
              : [...e.steps, step]
          return { ...e, steps }
        }),
      }))
    },

    removeExecution: (executionId: string) => {
      set((s) => ({
        executions: s.executions.filter((e) => e.id !== executionId),
      }))
    },

    clearExecutions: () => {
      set({ executions: [] })
    },

    fetchExecutions: async (requirementId?: string) => {
      const wsId = get().activeWorkspaceId
      if (!wsId) return
      try {
        const resp = await workspaceApi.listExecutions(wsId, requirementId)
        const fetched = (resp.data ?? []).map(normalizeExec)
        set((s) => {
          const existingIds = new Set(fetched.map((e) => e.id))
          const running = s.executions.filter(
            (e) => !existingIds.has(e.id) && (e.status === 'running' || e.status === 'queued'),
          )
          return { executions: [...running, ...fetched].slice(0, MAX_EXECUTIONS) }
        })
      } catch {
        // API may not be available yet; keep existing state
      }
    },

    persistExecution: async (exec: AgentExecution) => {
      const wsId = get().activeWorkspaceId
      if (!wsId) return
      try {
        await workspaceApi.createExecution(wsId, {
          id: exec.id,
          requirementId: exec.requirementId,
          taskIds: exec.taskIds,
          intentType: exec.intentType,
          intentSummary: exec.intentSummary,
          triggeredBy: exec.triggeredBy,
          userMessage: exec.userMessage,
          agentType: exec.agentType,
          resultType: exec.resultType,
          parentExecutionId: exec.parentExecutionId,
        })
      } catch {
        // fire-and-forget; SSE/WS will keep local state in sync
      }
    },

    persistExecutionUpdate: async (executionId: string, updates: {
      status?: string; steps?: string; resultPayload?: string;
      errorMessage?: string; taskIds?: string[]; chatMessageId?: string;
    }) => {
      const wsId = get().activeWorkspaceId
      if (!wsId) return
      try {
        await workspaceApi.updateExecution(wsId, executionId, updates)
      } catch {
        // fire-and-forget
      }
    },
  } satisfies Pick<
    WorkspaceState,
    'executions' | 'upsertExecution' | 'patchExecutionStatus' | 'patchExecutionStep' |
    'removeExecution' | 'clearExecutions' | 'fetchExecutions' | 'persistExecution' | 'persistExecutionUpdate'
  >
}
