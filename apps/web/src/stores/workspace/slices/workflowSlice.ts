import type { StoreApi } from 'zustand'
import type { WorkflowEvent, RequirementStatus, PhaseType } from '../../../types'
import { workflowApi } from '../../../lib/api'
import { workflowEventToMessage } from '../helpers'
import type { WorkspaceState } from '../types'

type SetState = StoreApi<WorkspaceState>['setState']
type GetState = StoreApi<WorkspaceState>['getState']

// Helper to check if AI execution is allowed for a requirement
function canExecuteAI(
  status: RequirementStatus,
  phase: PhaseType,
  targetPhase: PhaseType
): { allowed: boolean; reason?: string } {
  // Design mode: only requirement phase allowed for draft/designing
  if (status === 'draft' || status === 'designing') {
    if (targetPhase !== 'requirement') {
      return {
        allowed: false,
        reason: '需求尚未发布，请先完成设计并发布',
      }
    }
    return { allowed: true }
  }

  // Execute mode: all phases allowed for ready/in_progress/completed
  if (status === 'ready' || status === 'in_progress' || status === 'completed') {
    return { allowed: true }
  }

  return { allowed: false, reason: '未知需求状态' }
}

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
      const req = get().workspaces.find(w => w.id === wsId)?.requirements?.find(r => r.id === reqId)
      if (!wsId || get().workflowRunning) return

        // Check requirement status before executing AI
      if (req) {
        const targetPhase = phaseType || req.currentPhase || 'requirement'
        const check = canExecuteAI(req.status, req.currentPhase || 'requirement', targetPhase as PhaseType)
        if (!check.allowed) {
          console.warn('AI execution blocked:', check.reason)
          // Add system message to inform user
          const sysMsg = {
            id: `sys-${Date.now()}`,
            role: 'system' as const,
            content: `⚠️ ${check.reason}，请先发布需求。`,
            timestamp: new Date().toISOString(),
            contextType: 'workspace' as const,
          }
          set((s) => ({ messages: [...s.messages, sysMsg] }))
          return
        }
      }

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
