import { create } from 'zustand'
import type {
  Workspace, Message, PhaseStatus, WorkspaceColor,
  ActivityItem, AgentType, Task, TaskPriority, LabelColor,
} from '../types'
import {
  workspaceApi, agentApi, mapNLPResultToMessage, mapAgentChatToMessage,
  streamSSE,
} from '../lib/api'

export interface LogEntry {
  id: string
  timestamp: string
  agent: string
  level: 'info' | 'warn' | 'error' | 'success'
  message: string
  taskId?: string
}

interface WorkspaceState {
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  activePhaseId: string | null
  messages: Message[]
  loading: boolean
  nlpLoading: boolean
  chatLoading: boolean
  executionLogs: Record<string, LogEntry[]>

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
  sendNLPMessageStream: (input: string) => void
  sendAgentChatMessageStream: (agentType: string, input: string) => void
  appendExecutionLog: (workspaceId: string, entry: LogEntry) => void
}

function patchWorkspace(
  workspaces: Workspace[],
  id: string,
  fn: (w: Workspace) => Workspace,
): Workspace[] {
  return workspaces.map((w) => (w.id === id ? fn(w) : w))
}

let wsLoadGeneration = 0

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  activeWorkspaceId: null,
  activePhaseId: null,
  messages: [],
  loading: false,
  nlpLoading: false,
  chatLoading: false,
  executionLogs: {},

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
      if (get().activeWorkspaceId !== id) return
      set((s) => ({
        workspaces: patchWorkspace(s.workspaces, id, () => ws),
      }))
    } catch (err) {
      console.error('Failed to refresh workspace:', err)
    }
  },

  setActiveWorkspace: (id) => {
    const gen = ++wsLoadGeneration
    set({ activeWorkspaceId: id, activePhaseId: null, messages: [] })
    if (id) {
      workspaceApi.get(id).then((ws) => {
        if (wsLoadGeneration !== gen) return
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
      nlpLoading: true,
      messages: [
        ...s.messages,
        {
          id: crypto.randomUUID(),
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
          nlpLoading: false,
          messages: [...s.messages, agentMsg],
        }))
        get().refreshActiveWorkspace()
      })
      .catch((err) => {
        set((s) => ({
          nlpLoading: false,
          messages: [
            ...s.messages,
            {
              id: crypto.randomUUID(),
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
    const prev = get().workspaces.find((w) => w.id === id)
    set((s) => ({
      workspaces: patchWorkspace(s.workspaces, id, (w) => ({
        ...w,
        ...updates,
        updatedAt: new Date().toISOString(),
      })),
    }))
    workspaceApi.update(id, updates).catch((err) => {
      console.error('Failed to update workspace:', err)
      if (prev) {
        set((s) => ({ workspaces: patchWorkspace(s.workspaces, id, () => prev) }))
      }
    })
  },

  deleteWorkspace: (id) => {
    const prev = get().workspaces
    set((s) => ({
      workspaces: s.workspaces.filter((w) => w.id !== id),
      activeWorkspaceId: s.activeWorkspaceId === id ? null : s.activeWorkspaceId,
    }))
    workspaceApi.delete(id).catch((err) => {
      console.error('Failed to delete workspace:', err)
      set({ workspaces: prev })
    })
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

  deleteTask: (workspaceId, _phaseId, taskId) => {
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

  updatePhaseStatus: (workspaceId, phaseId, status) => {
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
          { ...activity, id: crypto.randomUUID(), timestamp: new Date().toISOString() },
          ...w.activities,
        ],
      })),
    })),

  reorderTasks: (workspaceId, phaseId, taskIds) => {
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

  agentChatMessages: {},

  sendAgentChatMessage: (agentType, input) => {
    const wsId = get().activeWorkspaceId
    if (!wsId) return
    const key = `${wsId}:${agentType}`
    const ts = new Date().toISOString()
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input,
      timestamp: ts,
    }
    set((s) => ({
      chatLoading: true,
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
          chatLoading: false,
          agentChatMessages: {
            ...s.agentChatMessages,
            [key]: [...(s.agentChatMessages[key] || []), agentMsg],
          },
        }))
        get().refreshActiveWorkspace()
      })
      .catch((err) => {
        const errMsg: Message = {
          id: crypto.randomUUID(),
          role: 'agent',
          content: `Error: ${err.message}`,
          agentType: agentType as AgentType,
          timestamp: new Date().toISOString(),
        }
        set((s) => ({
          chatLoading: false,
          agentChatMessages: {
            ...s.agentChatMessages,
            [key]: [...(s.agentChatMessages[key] || []), errMsg],
          },
        }))
      })
  },

  sendNLPMessageStream: (input) => {
    const wsId = get().activeWorkspaceId
    if (!wsId) return

    const sessionId = `s-${Math.floor(Date.now() / 300000)}`
    const ts = new Date().toISOString()
    const msgId = crypto.randomUUID()

    set((s) => ({
      nlpLoading: true,
      messages: [
        ...s.messages,
        { id: crypto.randomUUID(), role: 'user' as const, content: input, timestamp: ts, sessionId },
      ],
    }))

    ;(async () => {
      let content = ''
      let agentType: AgentType = 'pm'
      try {
        set((s) => ({
          messages: [...s.messages, {
            id: msgId, role: 'agent' as const, content: '', agentType,
            timestamp: new Date().toISOString(), sessionId,
          }],
        }))

        for await (const evt of streamSSE('/api/nlp/stream', { workspace_id: wsId, message: input })) {
          const data = JSON.parse(evt.data)

          if (evt.event === 'intent' && data.target_agent) {
            agentType = data.target_agent as AgentType
          }

          if (data.delta) {
            content += data.delta
          } else if (data.summary || data.payload?.summary) {
            content = data.summary || data.payload?.summary || content
          } else if (data.error) {
            content = `Error: ${data.error}`
          }

          set((s) => ({
            messages: s.messages.map((m) =>
              m.id === msgId ? { ...m, content, agentType } : m
            ),
          }))
        }
      } catch (err: any) {
        if (!content) {
          set((s) => ({
            messages: s.messages.map((m) =>
              m.id === msgId ? { ...m, content: `Request failed: ${err.message}` } : m
            ),
          }))
        }
      } finally {
        set({ nlpLoading: false })
        get().refreshActiveWorkspace()
      }
    })()
  },

  sendAgentChatMessageStream: (agentType, input) => {
    const wsId = get().activeWorkspaceId
    if (!wsId) return
    const key = `${wsId}:${agentType}`
    const ts = new Date().toISOString()
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input,
      timestamp: ts,
    }
    const replyId = crypto.randomUUID()

    set((s) => ({
      chatLoading: true,
      agentChatMessages: {
        ...s.agentChatMessages,
        [key]: [
          ...(s.agentChatMessages[key] || []),
          userMsg,
          { id: replyId, role: 'agent' as const, content: '', agentType: agentType as AgentType, timestamp: ts },
        ],
      },
    }))

    ;(async () => {
      let content = ''
      try {
        for await (const evt of streamSSE(`/api/agents/${agentType}/chat/stream`, {
          workspace_id: wsId,
          message: input,
        })) {
          const data = JSON.parse(evt.data)
          if (data.delta) {
            content += data.delta
            set((s) => ({
              agentChatMessages: {
                ...s.agentChatMessages,
                [key]: (s.agentChatMessages[key] || []).map((m) =>
                  m.id === replyId ? { ...m, content } : m
                ),
              },
            }))
          } else if (data.error) {
            content = `Error: ${data.error}`
          }
        }
      } catch (err: any) {
        if (!content) {
          set((s) => ({
            agentChatMessages: {
              ...s.agentChatMessages,
              [key]: (s.agentChatMessages[key] || []).map((m) =>
                m.id === replyId ? { ...m, content: `Error: ${err.message}` } : m
              ),
            },
          }))
        }
      } finally {
        set({ chatLoading: false })
        get().refreshActiveWorkspace()
      }
    })()
  },

  appendExecutionLog: (workspaceId, entry) => {
    if (!workspaceId) return
    set((s) => ({
      executionLogs: {
        ...s.executionLogs,
        [workspaceId]: [...(s.executionLogs[workspaceId] || []), entry].slice(-500),
      },
    }))
  },
}))
