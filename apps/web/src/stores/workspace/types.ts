import type {
  Workspace,
  Message,
  ConversationContext,
  PhaseStatus,
  WorkspaceColor,
  ActivityItem,
  AgentType,
  AgentExecution,
  ExecutionStatus,
  ExecutionStep,
  Task,
  TaskPriority,
  LabelColor,
  WorkspaceRepo,
  Requirement,
  UnifiedEvent,
} from '../../types'

export interface AgentStatusEvent {
  agentType: string
  status: import('../../types').AgentStatus
  detail?: string
  timestamp: number
}

export interface AgentLogEntry {
  id: string
  timestamp: string
  agent: string
  phase: string
  level: 'info' | 'success' | 'warn' | 'error'
  message: string
  taskId?: string
}

export interface MessageScope {
  contextType: ConversationContext
  workspaceId?: string
  requirementId?: string
}

export interface WorkspaceState {
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  activePhaseId: string | null
  /**
   * True after the active workspace has been loaded via GET /workspaces/:id at least once
   * since it became active. List responses omit requirements; until this is true, `requirements`
   * on the row may be stale empty and must not drive zero-requirement UX or `zero_requirements` NLU.
   */
  workspaceDetailReady: boolean
  messages: Message[]
  loading: boolean
  nlpLoading: boolean
  chatLoading: boolean
  agentStatusHistory: Record<string, AgentStatusEvent[]>

  fetchWorkspaces: () => Promise<void>
  refreshWorkspaceDocument: () => Promise<void>
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
  fetchMessages: (scope: MessageScope) => Promise<void>
  fetchWorkspaceMessages: (workspaceId?: string) => Promise<void>
  updateAgentStatus: (
    workspaceId: string,
    agentType: string,
    status: import('../../types').AgentStatus,
    detail?: string,
  ) => void
  patchTaskStatus: (workspaceId: string, taskId: string, status: PhaseStatus) => void

  workflowRunning: boolean
  workflowEvents: UnifiedEvent[]
  appendWorkflowEvent: (event: UnifiedEvent) => void

  agentLogs: AgentLogEntry[]
  appendAgentLog: (entry: AgentLogEntry) => void
  clearAgentLogs: () => void
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

  loadOlderMessages: (scope?: MessageScope) => void
  messagesCursor: string | null
  messagesHasMore: boolean
  homeMessagesCursor: string | null
  homeMessagesHasMore: boolean

  homeMessages: Message[]
  homeNlpLoading: boolean
  sendHomeNLPStream: (input: string) => void
  clearHomeMessages: () => void
  clearWorkspaceConversation: () => void

  executions: AgentExecution[]
  upsertExecution: (exec: AgentExecution) => void
  patchExecutionStatus: (
    executionId: string,
    status: ExecutionStatus,
    extra?: Partial<Pick<AgentExecution, 'errorMessage' | 'completedAt' | 'resultPayload'>>,
  ) => void
  patchExecutionStep: (executionId: string, step: ExecutionStep) => void
  removeExecution: (executionId: string) => void
  clearExecutions: () => void
  fetchExecutions: (requirementId?: string) => Promise<void>
  persistExecution: (exec: AgentExecution) => Promise<void>
  persistExecutionUpdate: (executionId: string, updates: {
    status?: string; steps?: string; resultPayload?: string;
    errorMessage?: string; taskIds?: string[]; chatMessageId?: string;
  }) => Promise<void>
}

/** Return shape of `buildCoreSlice` — defined here so `Pick` keys are checked against `WorkspaceState` in one file. */
export type CoreSlice = Pick<
  WorkspaceState,
  | 'workspaces'
  | 'activeWorkspaceId'
  | 'activePhaseId'
  | 'workspaceDetailReady'
  | 'loading'
  | 'fetchWorkspaces'
  | 'refreshWorkspaceDocument'
  | 'refreshActiveWorkspace'
  | 'setActiveWorkspace'
  | 'setActivePhase'
  | 'createWorkspace'
  | 'updateWorkspace'
  | 'deleteWorkspace'
  | 'createWorkspaceFromTemplate'
  | 'archiveWorkspace'
  | 'unarchiveWorkspace'
  | 'resetWorkspacePhases'
  | 'addRepo'
  | 'removeRepo'
  | 'updateRepoInStore'
>
