import type { StoreApi } from 'zustand'
import type { WorkflowEvent } from '../../../types'
import { workflowApi } from '../../../lib/api'
import { workflowEventToMessage } from '../helpers'
import type { WorkspaceState } from '../types'

type SetState = StoreApi<WorkspaceState>['setState']
type GetState = StoreApi<WorkspaceState>['getState']

export function buildWorkflowSlice(set: SetState, get: GetState) {
  return {
    workflowRunning: false,
    workflowEvents: [] as WorkflowEvent[],

    runTask: (taskId: string) => {
      const wsId = get().activeWorkspaceId
      if (!wsId || get().workflowRunning) return

      set({ workflowRunning: true, workflowEvents: [] })

      ;(async () => {
        try {
          for await (const evt of workflowApi.runTask(wsId, taskId)) {
            try {
              const data = JSON.parse(evt.data) as WorkflowEvent
              set((s) => ({ workflowEvents: [...s.workflowEvents, data] }))
              if (data.task_id) {
                if (data.type === 'workflow:task_start') {
                  get().patchTaskStatus(wsId, data.task_id, 'in_progress')
                } else if (data.type === 'workflow:task_complete') {
                  get().patchTaskStatus(wsId, data.task_id, 'completed')
                } else if (data.type === 'workflow:task_error') {
                  get().patchTaskStatus(wsId, data.task_id, 'pending')
                }
              }
              const sysMsg = workflowEventToMessage(data)
              if (sysMsg) set((s) => ({ messages: [...s.messages, sysMsg] }))
            } catch {
              /* skip parse errors */
            }
          }
        } catch (err) {
          console.error('Workflow run-task failed:', err)
        } finally {
          set({ workflowRunning: false })
          get().refreshActiveWorkspace()
        }
      })()
    },

    runPhase: (phaseType: string, userMessage?: string) => {
      const wsId = get().activeWorkspaceId
      if (!wsId || get().workflowRunning) return

      set({ workflowRunning: true, workflowEvents: [] })

      ;(async () => {
        try {
          for await (const evt of workflowApi.runPhase(wsId, phaseType, userMessage)) {
            try {
              const data = JSON.parse(evt.data) as WorkflowEvent
              set((s) => ({ workflowEvents: [...s.workflowEvents, data] }))
              if (data.task_id) {
                if (data.type === 'workflow:task_start') {
                  get().patchTaskStatus(wsId, data.task_id, 'in_progress')
                } else if (data.type === 'workflow:task_complete') {
                  get().patchTaskStatus(wsId, data.task_id, 'completed')
                } else if (data.type === 'workflow:task_error') {
                  get().patchTaskStatus(wsId, data.task_id, 'pending')
                }
              }
              const sysMsg = workflowEventToMessage(data)
              if (sysMsg) set((s) => ({ messages: [...s.messages, sysMsg] }))
            } catch {
              /* skip parse errors */
            }
          }
        } catch (err) {
          console.error('Workflow run-phase failed:', err)
        } finally {
          set({ workflowRunning: false })
          get().refreshActiveWorkspace()
        }
      })()
    },

    runProject: (userMessage?: string) => {
      const wsId = get().activeWorkspaceId
      if (!wsId || get().workflowRunning) return

      set({ workflowRunning: true, workflowEvents: [] })

      ;(async () => {
        try {
          for await (const evt of workflowApi.runProject(wsId, userMessage)) {
            try {
              const data = JSON.parse(evt.data) as WorkflowEvent
              set((s) => ({ workflowEvents: [...s.workflowEvents, data] }))
              if (data.task_id) {
                if (data.type === 'workflow:task_start') {
                  get().patchTaskStatus(wsId, data.task_id, 'in_progress')
                } else if (data.type === 'workflow:task_complete') {
                  get().patchTaskStatus(wsId, data.task_id, 'completed')
                } else if (data.type === 'workflow:task_error') {
                  get().patchTaskStatus(wsId, data.task_id, 'pending')
                }
              }
              const sysMsg = workflowEventToMessage(data)
              if (sysMsg) set((s) => ({ messages: [...s.messages, sysMsg] }))
            } catch {
              /* skip parse errors */
            }
          }
        } catch (err) {
          console.error('Workflow run-project failed:', err)
        } finally {
          set({ workflowRunning: false })
          get().refreshActiveWorkspace()
        }
      })()
    },

    runRequirement: (reqId: string, phaseType?: string, userMessage?: string) => {
      const wsId = get().activeWorkspaceId
      if (!wsId || get().workflowRunning) return

      set({ workflowRunning: true, workflowEvents: [] })

      ;(async () => {
        try {
          for await (const evt of workflowApi.runRequirement(wsId, reqId, phaseType, userMessage)) {
            try {
              const data = JSON.parse(evt.data) as WorkflowEvent
              set((s) => ({ workflowEvents: [...s.workflowEvents, data] }))
              if (data.task_id) {
                if (data.type === 'workflow:task_start') {
                  get().patchTaskStatus(wsId, data.task_id, 'in_progress')
                } else if (data.type === 'workflow:task_complete') {
                  get().patchTaskStatus(wsId, data.task_id, 'completed')
                } else if (data.type === 'workflow:task_error') {
                  get().patchTaskStatus(wsId, data.task_id, 'pending')
                }
              }
              const sysMsg = workflowEventToMessage(data)
              if (sysMsg) set((s) => ({ messages: [...s.messages, sysMsg] }))
            } catch {
              /* skip parse errors */
            }
          }
        } catch (err) {
          console.error('runRequirement error:', err)
        } finally {
          set({ workflowRunning: false })
          get().refreshActiveWorkspace()
          if (get().activeRequirementId === reqId) {
            get().loadRequirementDetail(wsId, reqId)
          }
        }
      })()
    },
  } satisfies Pick<
    WorkspaceState,
    'workflowRunning' | 'workflowEvents' | 'runTask' | 'runPhase' | 'runProject' | 'runRequirement'
  >
}
