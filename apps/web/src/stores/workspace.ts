import { create } from 'zustand'
import type {
  Workspace, Message, PhaseStatus, WorkspaceColor,
  ActivityItem, AgentType, Task, TaskPriority, LabelColor, WorkspaceRepo,
  Requirement,
} from '../types'
import {
  workspaceApi, workflowApi, agentApi, mapNLPResultToMessage, mapAgentChatToMessage,
  streamSSE,
} from '../lib/api'
import type { WorkflowEvent, RichBlock } from '../types'
import en from '../i18n/en'
import zh from '../i18n/zh'
import { useI18nStore } from '../i18n'
import type { TranslationKey } from '../i18n/en'
import { useUIStore } from './ui'

function tRaw(key: TranslationKey, vars?: Record<string, string>): string {
  const locale = useI18nStore.getState().locale
  let msg = (locale === 'zh' ? zh : en)[key] ?? key
  if (vars) Object.entries(vars).forEach(([k, v]) => { msg = msg.replace(`{${k}}`, v) })
  return msg
}

function friendlyError(raw: string): string {
  if (/rate.?limit|too.?many|SetLimitExceeded|inference limit/i.test(raw)) {
    return tRaw('error.llmRateLimit')
  }
  if (/502|bad gateway|all models failed/i.test(raw)) {
    return tRaw('error.llmUnavailable')
  }
  if (/timeout|timed out/i.test(raw)) {
    return tRaw('error.timeout')
  }
  if (/network|fetch|ECONNREFUSED/i.test(raw)) {
    return tRaw('error.networkError')
  }
  if (/nodename nor servname|Name or service not known|agent.*unavailable/i.test(raw)) {
    const agentMatch = raw.match(/Agent (\w+) unavailable/i)
    const agentName = agentMatch?.[1] || ''
    return agentName
      ? tRaw('error.agentUnavailable', { name: agentName })
      : tRaw('error.agentUnavailableGeneric')
  }
  return raw
}

function workflowEventToMessage(event: WorkflowEvent): Message | null {
  const t = tRaw
  type TK = TranslationKey
  const contentMap: Record<string, string | undefined> = {
    'workflow:phase_start': `${t('workflow.phaseStart' as TK)}: ${event.phase ?? ''}`,
    'workflow:phase_complete': `${t('workflow.phaseComplete' as TK)}: ${event.phase ?? ''} (${event.tasks_executed ?? 0})`,
    'workflow:phase_skip': `${t('workflow.phaseSkip' as TK)}: ${event.phase ?? ''} — ${event.reason ?? ''}`,
    'workflow:task_start': `${t('workflow.taskStart' as TK)}: ${event.task_title ?? ''}`,
    'workflow:task_complete': `${t('workflow.taskComplete' as TK)}: ${event.task_title ?? ''}`,
    'workflow:task_error': `${t('workflow.taskError' as TK)}: ${event.task_title ?? ''} — ${event.error ?? ''}`,
    'workflow:project_start': t('workflow.projectStart' as TK),
    'workflow:project_complete': t('workflow.projectComplete' as TK),
    'workflow:project_error': `${t('error.requestFailed' as TK)}: ${event.error ?? ''}`,
  }
  const content = contentMap[event.type]
  if (!content) return null
  return {
    id: crypto.randomUUID(),
    role: 'system',
    content,
    agentType: 'pm' as import('../types').AgentType,
    timestamp: new Date().toISOString(),
  }
}

export interface LogEntry {
  id: string
  timestamp: string
  agent: string
  level: 'info' | 'warn' | 'error' | 'success'
  message: string
  taskId?: string
}

export interface AgentStatusEvent {
  agentType: string
  status: import('../types').AgentStatus
  detail?: string
  timestamp: number
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
  agentStatusHistory: Record<string, AgentStatusEvent[]>

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
  updateAgentStatus: (workspaceId: string, agentType: string, status: import('../types').AgentStatus, detail?: string) => void
  patchTaskStatus: (workspaceId: string, taskId: string, status: PhaseStatus) => void

  workflowRunning: boolean
  workflowEvents: WorkflowEvent[]
  runTask: (taskId: string) => void
  runPhase: (phaseType: string, userMessage?: string) => void
  runProject: (userMessage?: string) => void

  // GitLab repo management
  addRepo: (wsId: string, repo: WorkspaceRepo) => void
  removeRepo: (wsId: string, repoId: string) => void
  updateRepoInStore: (wsId: string, repo: WorkspaceRepo) => void

  // Workspace lifecycle
  archiveWorkspace: (wsId: string) => void
  unarchiveWorkspace: (wsId: string) => void

  // Requirements
  activeRequirementId: string | null
  requirementDetail: Requirement | null
  setActiveRequirement: (id: string | null) => void
  createRequirement: (wsId: string, title: string, description: string) => void
  updateRequirement: (wsId: string, reqId: string, updates: Partial<{
    title: string; description: string; status: string; currentPhase: string;
    priority: string; iteration: string; progress: number; sortOrder: number
  }>) => void
  deleteRequirement: (wsId: string, reqId: string) => void
  runRequirement: (reqId: string, phaseType?: string, userMessage?: string) => void
  resetRequirementPhase: (reqId: string, phaseType: string) => void
  resetWorkspacePhases: (wsId: string) => Promise<void>
  loadRequirementDetail: (wsId: string, reqId: string) => void

  // Chat cursor pagination
  loadOlderMessages: () => void
  messagesCursor: string | null
  messagesHasMore: boolean
}

function safeParseRichBlocks(raw: unknown): import('../types').RichBlock[] | undefined {
  if (!raw) return undefined
  if (typeof raw !== 'string') return raw as import('../types').RichBlock[]
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

function patchWorkspace(
  workspaces: Workspace[],
  id: string,
  fn: (w: Workspace) => Workspace,
): Workspace[] {
  return workspaces.map((w) => (w.id === id ? fn(w) : w))
}

let wsLoadGeneration = 0

/** Aligns NLP "execute this phase" with the phase tab the user is viewing.
 *  Also injects GitLab repo context so PM agent knows which repo to target.
 */
function buildNlpPhaseContext(get: () => WorkspaceState): Record<string, unknown> | undefined {
  const id = get().activeWorkspaceId
  if (!id) return undefined
  const ws = get().workspaces.find((w) => w.id === id)
  const phaseId = get().activePhaseId
  const phase = ws?.phases.find((p) => p.id === phaseId)

  // Read NLP context from UI store (requirement + phase targeting)
  const nlpCtxState = useUIStore.getState().nlpContext

  const repos = ws?.repos ?? []
  const activePhaseType = nlpCtxState?.phaseType || phase?.type
  const phaseRepos = repos.filter((r) =>
    !r.phaseTypes?.length || (activePhaseType && r.phaseTypes.includes(activePhaseType))
  )
  const primary = phaseRepos.find((r) => r.isPrimary) ?? phaseRepos[0]

  const ctx: Record<string, unknown> = {}
  if (activePhaseType) ctx.phase_type = activePhaseType
  if (nlpCtxState?.agentType) ctx.target_agent = nlpCtxState.agentType
  if (nlpCtxState?.requirementId) ctx.requirement_id = nlpCtxState.requirementId
  if (phaseRepos.length) {
    ctx.gitlab_repos = phaseRepos.map((r) => ({
      projectId: r.projectId,
      projectName: r.projectName,
      gitlabUrl: r.gitlabUrl,
      role: r.role,
      isPrimary: r.isPrimary,
      branchDefault: r.branchDefault,
      branchStrategy: r.branchStrategy,
      credentialId: r.credentialId,
    }))
    if (primary) {
      ctx.gitlab_primary_project = primary.projectId
      ctx.gitlab_primary_url = primary.gitlabUrl
    }
  }
  return Object.keys(ctx).length ? ctx : undefined
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  activeWorkspaceId: null,
  activePhaseId: null,
  messages: [],
  loading: false,
  nlpLoading: false,
  chatLoading: false,
  executionLogs: {},
  agentStatusHistory: {},

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
      const [ws, actResp] = await Promise.all([
        workspaceApi.get(id),
        workspaceApi.listActivities(id, 1, 50),
      ])
      if (get().activeWorkspaceId !== id) return
      const activities = (actResp.data || []).map((a: any) => ({
        id: a.id,
        type: a.type,
        description: a.description,
        timestamp: a.timestamp || a.createdAt,
        agentType: a.agentType,
      }))
      set((s) => ({
        workspaces: patchWorkspace(s.workspaces, id, (prev) => {
          const liveAgentStatus = new Map(
            prev.agents
              .filter((a) => a.status !== 'idle')
              .map((a) => [a.type, { status: a.status, currentTask: a.currentTask }]),
          )
          const mergedAgents = (ws.agents || []).map((a: any) => {
            const live = liveAgentStatus.get(a.type)
            return live ? { ...a, ...live } : a
          })
          return { ...ws, activities, agents: mergedAgents }
        }),
      }))
    } catch (err) {
      console.error('Failed to refresh workspace:', err)
    }
  },

  setActiveWorkspace: (id) => {
    const gen = ++wsLoadGeneration
    set({ activeWorkspaceId: id, activePhaseId: null, messages: [], workflowEvents: [] })
    if (id && !id.startsWith('ws-temp-')) {
      Promise.all([
        workspaceApi.get(id),
        workspaceApi.listActivities(id, 1, 50),
        workspaceApi.listMessages(id, undefined, 50).catch(() => ({ data: [], hasMore: false })),
      ]).then(([ws, actResp, msgResp]) => {
        if (wsLoadGeneration !== gen) return
        const activities = (actResp.data || []).map((a: any) => ({
          id: a.id,
          type: a.type,
          description: a.description,
          timestamp: a.timestamp || a.createdAt,
          agentType: a.agentType,
        }))
        const merged = { ...ws, activities }
        // Restore persisted messages (API returns newest-first, UI needs oldest-first)
        const restored: Message[] = (msgResp.data || []).reverse().map((m: any) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          agentType: m.agentType,
          timestamp: m.createdAt,
          richBlocks: safeParseRichBlocks(m.richBlocks),
          sessionId: m.sessionId,
        }))
        set((s) => ({
          messages: restored,
          messagesCursor: (msgResp as any).cursor || null,
          messagesHasMore: (msgResp as any).hasMore || false,
          workspaces: s.workspaces.some((w) => w.id === id)
            ? patchWorkspace(s.workspaces, id, () => merged)
            : [...s.workspaces, merged],
        }))
      }).catch((err) => console.error('Failed to load workspace:', err))
    }
  },

  setActivePhase: (id) => set({ activePhaseId: id }),

  addMessage: (message) => {
    set((s) => ({ messages: [...s.messages, message] }))
    const wsId = get().activeWorkspaceId
    if (wsId && !wsId.startsWith('ws-temp-')) {
      workspaceApi.saveMessage(wsId, {
        role: message.role,
        content: message.content || '',
        agentType: message.agentType,
        richBlocks: message.richBlocks ? JSON.stringify(message.richBlocks) : undefined,
      }).catch((err) => console.warn('Failed to persist message:', err))
    }
  },

  sendNLPMessage: (input) => {
    const wsId = get().activeWorkspaceId
    if (!wsId) return

    const sessionId = `s-${Math.floor(Date.now() / 300000)}`
    const ts = new Date().toISOString()

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user' as const,
      content: input,
      timestamp: ts,
      sessionId,
    }

    set((s) => ({
      nlpLoading: true,
      messages: [...s.messages, userMsg],
    }))

    if (!wsId.startsWith('ws-temp-')) {
      workspaceApi.saveMessage(wsId, { role: 'user', content: input })
        .catch((err) => console.warn('Failed to persist user message:', err))
    }

    const nlpCtx = buildNlpPhaseContext(get)
    agentApi
      .nlp(wsId, input, nlpCtx)
      .then((resp) => {
        const agentMsg = mapNLPResultToMessage(resp, sessionId)
        set((s) => ({
          nlpLoading: false,
          messages: [...s.messages, agentMsg],
        }))
        if (!wsId.startsWith('ws-temp-')) {
          workspaceApi.saveMessage(wsId, {
            role: agentMsg.role,
            content: agentMsg.content || '',
            agentType: agentMsg.agentType,
            richBlocks: agentMsg.richBlocks ? JSON.stringify(agentMsg.richBlocks) : undefined,
          }).catch((err) => console.warn('Failed to persist agent message:', err))
        }
        get().refreshActiveWorkspace()
      })
      .catch((err) => {
        const errContent = friendlyError(err.message)
        const errMsg: Message = {
          id: crypto.randomUUID(),
          role: 'agent' as const,
          content: errContent,
          agentType: 'pm' as AgentType,
          timestamp: new Date().toISOString(),
          sessionId,
        }
        set((s) => ({
          nlpLoading: false,
          messages: [...s.messages, errMsg],
        }))
        if (!wsId.startsWith('ws-temp-')) {
          workspaceApi.saveMessage(wsId, {
            role: 'agent', content: errContent, agentType: 'pm',
          }).catch(() => {})
        }
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
      currentPhaseId: null,
      color: 'indigo',
      status: 'active',
      phases: [],
      agents: [],
      activities: [],
      repos: [],
      requirements: [],
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
    const now = new Date().toISOString()
    set((s) => ({
      workspaces: patchWorkspace(s.workspaces, workspaceId, (w) => ({
        ...w,
        updatedAt: now,
        phases: w.phases.map((p) =>
          p.id === phaseId
            ? {
                ...p,
                tasks: [...p.tasks, {
                  id: tempId, title, status: 'pending' as PhaseStatus,
                  phaseId, workspaceId, sortOrder: p.tasks.length,
                  createdAt: now, updatedAt: now,
                }],
              }
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
      currentPhaseId: null,
      status: 'active',
      phases: [],
      agents: [],
      activities: [],
      repos: [],
      requirements: [],
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
          content: friendlyError(err.message),
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
    const persist = !wsId.startsWith('ws-temp-')

    set((s) => ({
      nlpLoading: true,
      messages: [
        ...s.messages,
        { id: crypto.randomUUID(), role: 'user' as const, content: input, timestamp: ts, sessionId },
      ],
    }))

    if (persist) {
      workspaceApi.saveMessage(wsId, { role: 'user', content: input }).catch(() => {})
    }

    ;(async () => {
      let content = ''
      let agentType: AgentType = 'pm'
      const richBlocks: RichBlock[] = []
      try {
        set((s) => ({
          messages: [...s.messages, {
            id: msgId, role: 'agent' as const, content: '', agentType,
            timestamp: new Date().toISOString(), sessionId,
          }],
        }))

        const nlpCtx = buildNlpPhaseContext(get)
        for await (const evt of agentApi.nlpStream(wsId, input, nlpCtx)) {
          let data: any
          try { data = JSON.parse(evt.data) } catch { continue }

          if (evt.event === 'intent' && data.target_agent) {
            agentType = data.target_agent as AgentType
          }

          if (data.delta) {
            content += data.delta
          } else if (data.summary || data.payload?.summary) {
            content = data.summary || data.payload?.summary || content
          } else if (data.error) {
            content = friendlyError(data.error)
          }

          if (data.payload?.artifacts) {
            for (const art of data.payload.artifacts) {
              richBlocks.push({
                type: 'code', title: art.title,
                language: art.type === 'diagram' ? 'text' : art.type === 'adr' ? 'markdown' : art.type,
                code: art.content,
              })
            }
          }
          if (data.payload?.created_tasks) {
            for (const t of data.payload.created_tasks) {
              richBlocks.push({ type: 'task_card', taskTitle: t.title || t.data?.title, taskStatus: 'pending' })
            }
          }
          if (data.rich_blocks) {
            for (const rb of data.rich_blocks) {
              if (rb.type === 'code') richBlocks.push({ type: 'code', title: rb.title, language: rb.language, code: rb.content || rb.code })
              else if (rb.type === 'task_card') richBlocks.push({ type: 'task_card', taskTitle: rb.content || rb.taskTitle, taskStatus: 'pending' })
            }
          }

          set((s) => ({
            messages: s.messages.map((m) =>
              m.id === msgId ? { ...m, content, agentType, richBlocks: richBlocks.length > 0 ? [...richBlocks] : undefined } : m
            ),
          }))
        }
      } catch (err: any) {
        if (!content) {
          content = friendlyError(err.message)
          set((s) => ({
            messages: s.messages.map((m) =>
              m.id === msgId ? { ...m, content } : m
            ),
          }))
        }
      } finally {
        set({ nlpLoading: false })
        if (persist && content) {
          workspaceApi.saveMessage(wsId, {
            role: 'agent', content, agentType,
            richBlocks: richBlocks.length > 0 ? JSON.stringify(richBlocks) : undefined,
          }).catch(() => {})
        }
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
      const richBlocks: RichBlock[] = []
      try {
        for await (const evt of streamSSE(`/api/agents/${agentType}/chat/stream`, {
          workspace_id: wsId,
          message: input,
        })) {
          let data: any
          try { data = JSON.parse(evt.data) } catch { continue }
          if (data.delta) {
            content += data.delta
          } else if (data.summary) {
            content = data.summary
          } else if (data.content) {
            content = data.content
          } else if (data.error) {
            content = friendlyError(data.error)
          }
          if (data.rich_blocks) {
            for (const rb of data.rich_blocks) {
              if (rb.type === 'code') richBlocks.push({ type: 'code', title: rb.title, language: rb.language, code: rb.content || rb.code })
              else if (rb.type === 'task_card') richBlocks.push({ type: 'task_card', taskTitle: rb.content || rb.taskTitle, taskStatus: 'pending' })
            }
          }
          if (content) {
            set((s) => ({
              agentChatMessages: {
                ...s.agentChatMessages,
                [key]: (s.agentChatMessages[key] || []).map((m) =>
                  m.id === replyId ? { ...m, content, richBlocks: richBlocks.length > 0 ? [...richBlocks] : undefined } : m
                ),
              },
            }))
          }
        }
      } catch (err: any) {
        if (!content) {
          set((s) => ({
            agentChatMessages: {
              ...s.agentChatMessages,
              [key]: (s.agentChatMessages[key] || []).map((m) =>
                m.id === replyId ? { ...m, content: friendlyError(err.message) } : m
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

  updateAgentStatus: (workspaceId, agentType, status, detail) => {
    const event: AgentStatusEvent = { agentType, status, detail, timestamp: Date.now() }
    set((s) => ({
      workspaces: patchWorkspace(s.workspaces, workspaceId, (w) => ({
        ...w,
        agents: w.agents.map((a) =>
          a.type === agentType
            ? {
                ...a,
                status,
                currentTask: status === 'idle' ? undefined : (detail !== undefined ? detail : a.currentTask),
              }
            : a
        ),
      })),
      agentStatusHistory: {
        ...s.agentStatusHistory,
        [workspaceId]: [...(s.agentStatusHistory[workspaceId] || []), event].slice(-200),
      },
    }))
  },

  patchTaskStatus: (workspaceId, taskId, status) => {
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

  // GitLab repo management (optimistic local state updates)
  addRepo: (wsId, repo) =>
    set((s) => ({
      workspaces: patchWorkspace(s.workspaces, wsId, (w) => ({
        ...w,
        repos: [...(w.repos ?? []), repo],
      })),
    })),

  removeRepo: (wsId, repoId) =>
    set((s) => ({
      workspaces: patchWorkspace(s.workspaces, wsId, (w) => ({
        ...w,
        repos: (w.repos ?? []).filter((r) => r.id !== repoId),
      })),
    })),

  updateRepoInStore: (wsId, repo) =>
    set((s) => ({
      workspaces: patchWorkspace(s.workspaces, wsId, (w) => ({
        ...w,
        repos: (w.repos ?? []).map((r) => (r.id === repo.id ? repo : r)),
      })),
    })),

  workflowRunning: false,
  workflowEvents: [],

  runTask: (taskId) => {
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
          } catch { /* skip parse errors */ }
        }
      } catch (err) {
        console.error('Workflow run-task failed:', err)
      } finally {
        set({ workflowRunning: false })
        get().refreshActiveWorkspace()
      }
    })()
  },

  runPhase: (phaseType, userMessage) => {
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
          } catch { /* skip parse errors */ }
        }
      } catch (err) {
        console.error('Workflow run-phase failed:', err)
      } finally {
        set({ workflowRunning: false })
        get().refreshActiveWorkspace()
      }
    })()
  },

  runProject: (userMessage) => {
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
          } catch { /* skip parse errors */ }
        }
      } catch (err) {
        console.error('Workflow run-project failed:', err)
      } finally {
        set({ workflowRunning: false })
        get().refreshActiveWorkspace()
      }
    })()
  },

  // ---- Workspace lifecycle ----
  archiveWorkspace: (wsId) => {
    workspaceApi.archiveWorkspace(wsId).then(() => {
      set((s) => ({
        workspaces: patchWorkspace(s.workspaces, wsId, (w) => ({ ...w, status: 'archived' })),
      }))
    }).catch((err) => console.error('Failed to archive workspace:', err))
  },

  unarchiveWorkspace: (wsId) => {
    workspaceApi.unarchiveWorkspace(wsId).then(() => {
      set((s) => ({
        workspaces: patchWorkspace(s.workspaces, wsId, (w) => ({ ...w, status: 'active' })),
      }))
    }).catch((err) => console.error('Failed to unarchive workspace:', err))
  },

  // ---- Requirements ----
  activeRequirementId: null,
  requirementDetail: null,

  setActiveRequirement: (id) => {
    set({ activeRequirementId: id, requirementDetail: null })
    if (id) {
      const wsId = get().activeWorkspaceId
      if (wsId) get().loadRequirementDetail(wsId, id)
    }
  },

  loadRequirementDetail: async (wsId, reqId) => {
    try {
      const detail = await workspaceApi.getRequirement(wsId, reqId)
      set({ requirementDetail: detail })
    } catch (e) {
      console.error('Failed to load requirement detail:', e)
    }
  },

  createRequirement: async (wsId, title, description) => {
    try {
      const req = await workspaceApi.createRequirement(wsId, { title, description })
      set((s) => ({
        workspaces: patchWorkspace(s.workspaces, wsId, (w) => ({
          ...w,
          requirements: [...(w.requirements ?? []), req],
        })),
      }))
    } catch (e) {
      console.error('Failed to create requirement:', e)
      get().refreshActiveWorkspace()
    }
  },

  updateRequirement: async (wsId, reqId, updates) => {
    const prevWorkspaces = get().workspaces
    set((s) => ({
      workspaces: patchWorkspace(s.workspaces, wsId, (w) => ({
        ...w,
        requirements: (w.requirements ?? []).map((r) =>
          r.id === reqId
            ? {
                ...r,
                ...updates,
                status: (updates.status as import('../types').RequirementStatus | undefined) ?? r.status,
                currentPhase: (updates.currentPhase as import('../types').PhaseType | undefined) ?? r.currentPhase,
                priority: (updates.priority as import('../types').TaskPriority | undefined) ?? r.priority,
                updatedAt: new Date().toISOString(),
              }
            : r
        ),
      })),
    }))
    try {
      const updated = await workspaceApi.updateRequirement(wsId, reqId, updates)
      set((s) => ({
        workspaces: patchWorkspace(s.workspaces, wsId, (w) => ({
          ...w,
          requirements: (w.requirements ?? []).map((r) => (r.id === reqId ? updated : r)),
        })),
        requirementDetail: s.activeRequirementId === reqId ? updated : s.requirementDetail,
      }))
    } catch (e) {
      console.error('Failed to update requirement:', e)
      set({ workspaces: prevWorkspaces })
    }
  },

  deleteRequirement: async (wsId, reqId) => {
    try {
      await workspaceApi.deleteRequirement(wsId, reqId)
      if (get().activeRequirementId === reqId) {
        set({ activeRequirementId: null, requirementDetail: null })
      }
      get().refreshActiveWorkspace()
    } catch (e) {
      console.error('Failed to delete requirement:', e)
    }
  },

  runRequirement: (reqId, phaseType, userMessage) => {
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
          } catch { /* skip parse errors */ }
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

  resetRequirementPhase: async (reqId, phaseType) => {
    const wsId = get().activeWorkspaceId
    if (!wsId) return
    try {
      await workspaceApi.resetRequirementPhase(wsId, reqId, phaseType)
      get().refreshActiveWorkspace()
      if (get().activeRequirementId === reqId) {
        get().loadRequirementDetail(wsId, reqId)
      }
    } catch (e) {
      console.error('Failed to reset requirement phase:', e)
    }
  },

  resetWorkspacePhases: async (wsId) => {
    try {
      await workspaceApi.resetWorkspacePhases(wsId)
      await get().refreshActiveWorkspace()
      const reqId = get().activeRequirementId
      if (reqId) get().loadRequirementDetail(wsId, reqId)
    } catch (e) {
      console.error('Failed to reset workspace phases:', e)
      throw e
    }
  },

  // ---- Chat cursor pagination ----
  messagesCursor: null,
  messagesHasMore: false,

  loadOlderMessages: () => {
    const wsId = get().activeWorkspaceId
    const cursor = get().messagesCursor
    if (!wsId || !cursor) return

    return workspaceApi.listMessages(wsId, cursor, 50).then((resp) => {
      const older: Message[] = (resp.data || []).reverse().map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        agentType: m.agentType,
        timestamp: m.createdAt,
        richBlocks: safeParseRichBlocks(m.richBlocks),
        sessionId: m.sessionId,
      }))
      set((s) => ({
        messages: [...older, ...s.messages],
        messagesCursor: resp.cursor || null,
        messagesHasMore: resp.hasMore,
      }))
    }).catch((err) => console.error('Failed to load older messages:', err))
  },
}))
