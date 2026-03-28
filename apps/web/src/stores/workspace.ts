import { create } from 'zustand'
import type {
  Workspace, Message, PhaseStatus, PhaseType, WorkspaceColor,
  ActivityItem, RichBlock, AgentType, Task, TaskPriority, LabelColor,
} from '../types'
import {
  workspaceApi, agentApi, mapNLPResultToMessage, mapAgentChatToMessage,
} from '../lib/api'

interface WorkspaceState {
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  activePhaseId: string | null
  messages: Message[]
  loading: boolean

  fetchWorkspaces: () => Promise<void>
  refreshActiveWorkspace: () => Promise<void>

  setActiveWorkspace: (id: string | null) => void
  setActivePhase: (id: string | null) => void
  addMessage: (message: Message) => void
  sendNLPMessage: (input: string) => void

  createWorkspace: () => string
  updateWorkspace: (id: string, updates: Partial<Pick<Workspace, 'name' | 'description'>>) => void
  deleteWorkspace: (id: string) => void

  addTask: (workspaceId: string, phaseId: string, title: string) => void
  updateTask: (workspaceId: string, phaseId: string, taskId: string, updates: Partial<{
    title: string; status: PhaseStatus; description: string;
    assignedAgent: AgentType; priority: TaskPriority; labels: LabelColor[]; dueDate: string
  }>) => void
  deleteTask: (workspaceId: string, phaseId: string, taskId: string) => void

  updatePhaseStatus: (workspaceId: string, phaseId: string, status: PhaseStatus) => void
  createWorkspaceFromTemplate: (name: string, description: string, color: WorkspaceColor) => string
  addActivity: (workspaceId: string, activity: Omit<ActivityItem, 'id' | 'timestamp'>) => void
  reorderTasks: (workspaceId: string, phaseId: string, taskIds: string[]) => void

  agentChatMessages: Record<string, Message[]>
  sendAgentChatMessage: (agentType: string, input: string) => void
}

function patchWorkspace(
  workspaces: Workspace[],
  id: string,
  fn: (w: Workspace) => Workspace,
): Workspace[] {
  return workspaces.map((w) => (w.id === id ? fn(w) : w))
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  activeWorkspaceId: null,
  activePhaseId: null,
  messages: [],
  loading: false,

  fetchWorkspaces: async () => {
    set({ loading: true })
    try {
      const list = await workspaceApi.list()
      set({ workspaces: list, loading: false })
    } catch (err) {
      console.error('Failed to fetch workspaces:', err)
      set({ loading: false })
    }
  },

  refreshActiveWorkspace: async () => {
    const id = get().activeWorkspaceId
    if (!id) return
    try {
      const ws = await workspaceApi.get(id)
      set((s) => ({
        workspaces: patchWorkspace(s.workspaces, id, () => ws),
      }))
    } catch (err) {
      console.error('Failed to refresh workspace:', err)
    }
  },

  setActiveWorkspace: (id) => {
    set({ activeWorkspaceId: id, activePhaseId: null, messages: [] })
    if (id) {
      workspaceApi.get(id).then((ws) => {
        set((s) => ({
          workspaces: s.workspaces.some((w) => w.id === id)
            ? patchWorkspace(s.workspaces, id, () => ws)
            : [...s.workspaces, ws],
        }))
      }).catch((err) => console.error('Failed to load workspace:', err))
    }
  },

  setActivePhase: (id) => set({ activePhaseId: id }),

  addMessage: (message) =>
    set((s) => ({ messages: [...s.messages, message] })),

  sendNLPMessage: (input) => {
    const wsId = get().activeWorkspaceId
    if (!wsId) return

    const sessionId = `s-${Math.floor(Date.now() / 300000)}`
    const ts = new Date().toISOString()

    set((s) => ({
      messages: [
        ...s.messages,
        {
          id: `msg-${Date.now()}`,
          role: 'user' as const,
          content: input,
          timestamp: ts,
          sessionId,
        },
      ],
    }))

    agentApi
      .nlp(wsId, input)
      .then((resp) => {
        const agentMsg = mapNLPResultToMessage(resp, sessionId)
        set((s) => ({
          messages: [...s.messages, agentMsg],
        }))
        get().refreshActiveWorkspace()
      })
      .catch((err) => {
        set((s) => ({
          messages: [
            ...s.messages,
            {
              id: `msg-${Date.now()}`,
              role: 'agent' as const,
              content: `Request failed: ${err.message}`,
              agentType: 'pm' as AgentType,
              timestamp: new Date().toISOString(),
              sessionId,
            },
          ],
        }))
      })
  },

  createWorkspace: () => {
    const tempId = `ws-temp-${Date.now()}`

    workspaceApi
      .create('Untitled Workspace', '', 'indigo')
      .then((ws) => {
        set((s) => ({
          workspaces: patchWorkspace(s.workspaces, tempId, () => ws),
          activeWorkspaceId:
            s.activeWorkspaceId === tempId ? ws.id : s.activeWorkspaceId,
        }))
      })
      .catch((err) => {
        console.error('Failed to create workspace:', err)
        set((s) => ({
          workspaces: s.workspaces.filter((w) => w.id !== tempId),
        }))
      })

    const placeholder: Workspace = {
      id: tempId,
      name: 'Untitled Workspace',
      description: '',
      progress: 0,
      currentPhaseId: '',
      color: 'indigo',
      phases: [],
      agents: [],
      activities: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    set((s) => ({ workspaces: [...s.workspaces, placeholder] }))
    return tempId
  },

  updateWorkspace: (id, updates) => {
    set((s) => ({
      workspaces: patchWorkspace(s.workspaces, id, (w) => ({
        ...w,
        ...updates,
        updatedAt: new Date().toISOString(),
      })),
    }))
    workspaceApi.update(id, updates).catch((err) =>
      console.error('Failed to update workspace:', err),
    )
  },

  deleteWorkspace: (id) => {
    set((s) => ({
      workspaces: s.workspaces.filter((w) => w.id !== id),
      activeWorkspaceId: s.activeWorkspaceId === id ? null : s.activeWorkspaceId,
    }))
    workspaceApi.delete(id).catch((err) =>
      console.error('Failed to delete workspace:', err),
    )
  },

  addTask: (workspaceId, phaseId, title) => {
    const tempId = `t-${Date.now()}`
    set((s) => ({
      workspaces: patchWorkspace(s.workspaces, workspaceId, (w) => ({
        ...w,
        updatedAt: new Date().toISOString(),
        phases: w.phases.map((p) =>
          p.id === phaseId
            ? { ...p, tasks: [...p.tasks, { id: tempId, title, status: 'pending' as PhaseStatus }] }
            : p,
        ),
      })),
    }))

    workspaceApi.createTask(workspaceId, phaseId, title).then((task) => {
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
    }).catch((err) => {
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

  updateTask: (workspaceId, _phaseId, taskId, updates) => {
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
    workspaceApi.updateTask(workspaceId, taskId, updates).catch((err) =>
      console.error('Failed to update task:', err),
    )
  },

  deleteTask: (workspaceId, _phaseId, taskId) => {
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
    workspaceApi.deleteTask(workspaceId, taskId).catch((err) =>
      console.error('Failed to delete task:', err),
    )
  },

  updatePhaseStatus: (workspaceId, phaseId, status) => {
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
    workspaceApi.updatePhaseStatus(workspaceId, phaseId, status).catch((err) =>
      console.error('Failed to update phase:', err),
    )
  },

  createWorkspaceFromTemplate: (name, description, color) => {
    const tempId = `ws-temp-${Date.now()}`

    workspaceApi
      .create(name, description, color)
      .then((ws) => {
        set((s) => ({
          workspaces: patchWorkspace(s.workspaces, tempId, () => ws),
          activeWorkspaceId:
            s.activeWorkspaceId === tempId ? ws.id : s.activeWorkspaceId,
        }))
      })
      .catch((err) => {
        console.error('Failed to create workspace:', err)
        set((s) => ({
          workspaces: s.workspaces.filter((w) => w.id !== tempId),
        }))
      })

    const placeholder: Workspace = {
      id: tempId,
      name,
      description,
      color,
      progress: 0,
      currentPhaseId: '',
      phases: [],
      agents: [],
      activities: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    set((s) => ({ workspaces: [...s.workspaces, placeholder] }))
    return tempId
  },

  addActivity: (workspaceId, activity) =>
    set((s) => ({
      workspaces: patchWorkspace(s.workspaces, workspaceId, (w) => ({
        ...w,
        activities: [
          { ...activity, id: `act-${Date.now()}`, timestamp: new Date().toISOString() },
          ...w.activities,
        ],
      })),
    })),

  reorderTasks: (workspaceId, phaseId, taskIds) => {
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
    workspaceApi.reorderTasks(workspaceId, phaseId, taskIds).catch((err) =>
      console.error('Failed to reorder tasks:', err),
    )
  },

  agentChatMessages: {},

  sendAgentChatMessage: (agentType, input) => {
    const wsId = get().activeWorkspaceId
    if (!wsId) return
    const key = `${wsId}:${agentType}`
    const ts = new Date().toISOString()
    const userMsg: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: input,
      timestamp: ts,
    }
    set((s) => ({
      agentChatMessages: {
        ...s.agentChatMessages,
        [key]: [...(s.agentChatMessages[key] || []), userMsg],
      },
    }))

    agentApi
      .chat(agentType, wsId, input)
      .then((resp) => {
        const agentMsg = mapAgentChatToMessage(resp, agentType)
        set((s) => ({
          agentChatMessages: {
            ...s.agentChatMessages,
            [key]: [...(s.agentChatMessages[key] || []), agentMsg],
          },
        }))
        get().refreshActiveWorkspace()
      })
      .catch((err) => {
        const errMsg: Message = {
          id: `msg-${Date.now()}`,
          role: 'agent',
          content: `Error: ${err.message}`,
          agentType: agentType as AgentType,
          timestamp: new Date().toISOString(),
        }
        set((s) => ({
          agentChatMessages: {
            ...s.agentChatMessages,
            [key]: [...(s.agentChatMessages[key] || []), errMsg],
          },
        }))
      })
  },
}))
