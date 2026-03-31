import type { StoreApi } from 'zustand'
import type { AgentExecution, ExecutionStatus, ExecutionStep } from '../../../types'
import type { WorkspaceState } from '../types'

type SetState = StoreApi<WorkspaceState>['setState']
type GetState = StoreApi<WorkspaceState>['getState']

const MAX_EXECUTIONS = 200

export function buildExecutionSlice(set: SetState, _get: GetState) {
  return {
    executions: [] as AgentExecution[],

    upsertExecution: (exec: AgentExecution) => {
      set((s) => {
        const idx = s.executions.findIndex((e) => e.id === exec.id)
        if (idx !== -1) {
          const updated = [...s.executions]
          updated[idx] = { ...updated[idx], ...exec }
          return { executions: updated }
        }
        return { executions: [exec, ...s.executions].slice(0, MAX_EXECUTIONS) }
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
  } satisfies Pick<
    WorkspaceState,
    'executions' | 'upsertExecution' | 'patchExecutionStatus' | 'patchExecutionStep' | 'removeExecution' | 'clearExecutions'
  >
}
