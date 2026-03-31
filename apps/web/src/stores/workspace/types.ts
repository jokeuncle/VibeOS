import type {
  Workspace,
  Message,
  PhaseStatus,
  WorkspaceColor,
  ActivityItem,
  AgentType,
  Task,
  TaskPriority,
  LabelColor,
  WorkspaceRepo,
  Requirement,
} from '../../types'
import type { WorkflowEvent } from '../../types'

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
  status: import('../../types').AgentStatus
  detail?: string
  timestamp: number
}

export interface WorkspaceState {
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
  updateTask: (
    workspaceId: string,
    phaseId: string,
    taskId: string,
    updates: Partial<{
      title: string
      status: PhaseStatus
      description: string
      assignedAgent: AgentType
      priority: TaskPriority
      labels: LabelColor[]
      dueDate: string
    }>,
  ) => void
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
  setExecutionLogs: (workspaceId: string, entries: LogEntry[]) => void
  fetchExecutionLogs: (workspaceId?: string) => Promise<void>
  fetchWorkspaceMessages: (workspaceId?: string) => Promise<void>
  updateAgentStatus: (
    workspaceId: string,
    agentType: string,
    status: import('../../types').AgentStatus,
    detail?: string,
  ) => void
  patchTaskStatus: (workspaceId: string, taskId: string, status: PhaseStatus) => void

  workflowRunning: boolean
  workflowEvents: WorkflowEvent[]
  runTask: (taskId: string) => void
  runPhase: (phaseType: string, userMessage?: string) => void
  runProject: (userMessage?: string) => void

  addRepo: (wsId: string, repo: WorkspaceRepo) => void
  removeRepo: (wsId: string, repoId: string) => void
  updateRepoInStore: (wsId: string, repo: WorkspaceRepo) => void

  archiveWorkspace: (wsId: string) => void
  unarchiveWorkspace: (wsId: string) => void
  resetWorkspacePhases: (wsId: string) => Promise<void>

  activeRequirementId: string | null
  requirementDetail: Requirement | null
  setActiveRequirement: (id: string | null) => void
  createRequirement: (wsId: string, title: string, description: string) => void
  updateRequirement: (
    wsId: string,
    reqId: string,
    updates: Partial<{
      title: string
      description: string
      status: string
      currentPhase: string
      priority: string
      iteration: string
      progress: number
      sortOrder: number
    }>,
  ) => void
  deleteRequirement: (wsId: string, reqId: string) => void
  runRequirement: (reqId: string, phaseType?: string, userMessage?: string) => void
  resetRequirementPhase: (reqId: string, phaseType: string) => void
  loadRequirementDetail: (wsId: string, reqId: string) => void

  loadOlderMessages: () => void
  messagesCursor: string | null
  messagesHasMore: boolean

  homeMessages: Message[]
  homeNlpLoading: boolean
  sendHomeNLPStream: (input: string) => void
  clearHomeMessages: () => void
  clearWorkspaceConversation: () => void
}
