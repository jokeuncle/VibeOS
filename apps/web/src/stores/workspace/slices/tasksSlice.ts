import type { StoreApi } from 'zustand'
import type { PhaseStatus, Task, AgentType } from '../../../types'
import { workspaceApi } from '../../../lib/api'
import { patchWorkspace } from '../helpers'
import type { WorkspaceState, AgentStatusEvent } from '../types'

type SetState = StoreApi<WorkspaceState>['setState']
type GetState = StoreApi<WorkspaceState>['getState']

export function buildTasksSlice(set: SetState, get: GetState) {
  return {
    agentStatusHistory: {} as Record<string, AgentStatusEvent[]>,

    addTask: (workspaceId: string, phaseId: string, title: string) => {
      const tempId = `t-${Date.now()}`
      const now = new Date().toISOString()
      set((s) => ({
        workspaces: patchWorkspace(s.workspaces, workspaceId, (w) => ({
          ...w,
          updatedAt: now,
          phases: w.phases.map((p) =>
            p.id === phaseId
              ? {
                  ...p,
                  tasks: [
                    ...p.tasks,
                    {
                      id: tempId,
                      title,
                      status: 'pending' as PhaseStatus,
                      phaseId,
                      workspaceId,
                      sortOrder: p.tasks.length,
                      createdAt: now,
                      updatedAt: now,
                    },
                  ],
                }
              : p,
          ),
        })),
      }))

      workspaceApi
        .createTask(workspaceId, phaseId, title)
        .then((task) => {
          set((s) => ({
            workspaces: patchWorkspace(s.workspaces, workspaceId, (w) => ({
              ...w,
              phases: w.phases.map((p) =>
                p.id === phaseId
                  ? { ...p, tasks: p.tasks.map((t) => (t.id === tempId ? { ...t, ...task } : t)) }
                  : p,
              ),
            })),
          }))
        })
        .catch((err) => {
          console.error('Failed to add task:', err)
          set((s) => ({
            workspaces: patchWorkspace(s.workspaces, workspaceId, (w) => ({
              ...w,
              phases: w.phases.map((p) =>
                p.id === phaseId
                  ? { ...p, tasks: p.tasks.filter((t) => t.id !== tempId) }
                  : p,
              ),
            })),
          }))
        })
    },

    updateTask: (
      workspaceId: string,
      _phaseId: string,
      taskId: string,
      updates: Parameters<WorkspaceState['updateTask']>[3],
    ) => {
      const prevWorkspaces = get().workspaces
      set((s) => ({
        workspaces: patchWorkspace(s.workspaces, workspaceId, (w) => ({
          ...w,
          updatedAt: new Date().toISOString(),
          phases: w.phases.map((p) => ({
            ...p,
            tasks: p.tasks.map((t) => (t.id === taskId ? { ...t, ...updates } : t)),
          })),
        })),
      }))
      workspaceApi.updateTask(workspaceId, taskId, updates).catch((err) => {
        console.error('Failed to update task:', err)
        set({ workspaces: prevWorkspaces })
      })
    },

    deleteTask: (workspaceId: string, _phaseId: string, taskId: string) => {
      const prevWorkspaces = get().workspaces
      set((s) => ({
        workspaces: patchWorkspace(s.workspaces, workspaceId, (w) => ({
          ...w,
          updatedAt: new Date().toISOString(),
          phases: w.phases.map((p) => ({
            ...p,
            tasks: p.tasks.filter((t) => t.id !== taskId),
          })),
        })),
      }))
      workspaceApi.deleteTask(workspaceId, taskId).catch((err) => {
        console.error('Failed to delete task:', err)
        set({ workspaces: prevWorkspaces })
      })
    },

    updatePhaseStatus: (workspaceId: string, phaseId: string, status: PhaseStatus) => {
      const prevWorkspaces = get().workspaces
      set((s) => ({
        workspaces: patchWorkspace(s.workspaces, workspaceId, (w) => ({
          ...w,
          updatedAt: new Date().toISOString(),
          phases: w.phases.map((p) =>
            p.id === phaseId
              ? {
                  ...p,
                  status,
                  progress: status === 'completed' ? 100 : status === 'in_progress' ? 50 : 0,
                }
              : p,
          ),
        })),
      }))
      workspaceApi.updatePhaseStatus(workspaceId, phaseId, status).catch((err) => {
        console.error('Failed to update phase:', err)
        set({ workspaces: prevWorkspaces })
      })
    },

    addActivity: (workspaceId: string, activity: Parameters<WorkspaceState['addActivity']>[1]) =>
      set((s) => ({
        workspaces: patchWorkspace(s.workspaces, workspaceId, (w) => ({
          ...w,
          activities: [
            { ...activity, id: crypto.randomUUID(), timestamp: new Date().toISOString() },
            ...w.activities,
          ],
        })),
      })),

    reorderTasks: (workspaceId: string, phaseId: string, taskIds: string[]) => {
      const prevWorkspaces = get().workspaces
      set((s) => ({
        workspaces: patchWorkspace(s.workspaces, workspaceId, (w) => ({
          ...w,
          phases: w.phases.map((p) =>
            p.id === phaseId
              ? {
                  ...p,
                  tasks: taskIds
                    .map((id) => p.tasks.find((t) => t.id === id))
                    .filter((t): t is Task => !!t),
                }
              : p,
          ),
        })),
      }))
      workspaceApi.reorderTasks(workspaceId, phaseId, taskIds).catch((err) => {
        console.error('Failed to reorder tasks:', err)
        set({ workspaces: prevWorkspaces })
      })
    },

    updateAgentStatus: (
      workspaceId: string,
      agentType: string,
      status: import('../../../types').AgentStatus,
      detail?: string,
    ) => {
      const event: AgentStatusEvent = { agentType, status, detail, timestamp: Date.now() }
      set((s) => ({
        workspaces: patchWorkspace(s.workspaces, workspaceId, (w) => ({
          ...w,
          agents: w.agents.map((a) =>
            a.type === agentType
              ? {
                  ...a,
                  status,
                  currentTask:
                    status === 'idle' ? undefined : detail !== undefined ? detail : a.currentTask,
                }
              : a,
          ),
        })),
        agentStatusHistory: {
          ...s.agentStatusHistory,
          [workspaceId]: [...(s.agentStatusHistory[workspaceId] || []), event].slice(-200),
        },
      }))
    },

    patchTaskStatus: (workspaceId: string, taskId: string, status: PhaseStatus) => {
      set((s) => ({
        workspaces: patchWorkspace(s.workspaces, workspaceId, (w) => ({
          ...w,
          phases: w.phases.map((p) => ({
            ...p,
            tasks: p.tasks.map((t) => (t.id === taskId ? { ...t, status } : t)),
          })),
        })),
      }))
    },
  } satisfies Pick<
    WorkspaceState,
    | 'agentStatusHistory'
    | 'addTask'
    | 'updateTask'
    | 'deleteTask'
    | 'updatePhaseStatus'
    | 'addActivity'
    | 'reorderTasks'
    | 'updateAgentStatus'
    | 'patchTaskStatus'
  >
}
