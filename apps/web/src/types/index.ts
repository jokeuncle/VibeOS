export type PhaseType =
  | 'requirement'
  | 'design'
  | 'architecture'
  | 'development'
  | 'testing'
  | 'deployment'
  | 'monitoring'

export type PhaseStatus = 'pending' | 'in_progress' | 'completed'

export type AgentType =
  | 'requirement'
  | 'design'
  | 'architecture'
  | 'development'
  | 'testing'
  | 'cicd'
  | 'monitoring'
  | 'pm'

export type AgentStatus = 'idle' | 'running' | 'waiting' | 'error'

export const WORKSPACE_COLORS = ['indigo', 'emerald', 'rose', 'amber', 'cyan', 'violet'] as const
export type WorkspaceColor = (typeof WORKSPACE_COLORS)[number]

export type TaskPriority = 'p0' | 'p1' | 'p2' | 'p3'

export type RequirementStatus = 'draft' | 'in_progress' | 'completed'
export type RelationType = 'depends_on' | 'parent_of' | 'related_to' | 'evolves_from' | 'conflicts_with'

export const LABEL_COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'] as const
export type LabelColor = (typeof LABEL_COLORS)[number]

export interface Task {
  id: string
  phaseId: string
  workspaceId: string
  title: string
  status: PhaseStatus
  description?: string
  priority?: TaskPriority
  labels?: LabelColor[]
  dueDate?: string
  assignedAgent?: AgentType
  requirementId?: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface ActivityItem {
  id: string
  type: string
  description: string
  timestamp: string
  agentType?: AgentType
}

export interface Phase {
  id: string
  workspaceId: string
  type: PhaseType
  name: string
  status: PhaseStatus
  progress: number
  tasks: Task[]
  description: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface Agent {
  id: string
  workspaceId: string
  type: AgentType
  name: string
  status: AgentStatus
  currentTask?: string
  avatar: string
  createdAt: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// GitLab integration types
// ---------------------------------------------------------------------------

export type RepoBranchStrategy = 'feature' | 'direct' | 'gitflow'
export type RepoRole = 'primary' | 'secondary' | 'infra' | 'docs'

export interface User {
  id: string
  email: string
  name: string
  avatarUrl?: string
  status: string
  createdAt: string
  updatedAt: string
}

export interface WorkspaceMember {
  id: string
  workspaceId: string
  userId: string
  role: 'owner' | 'editor' | 'viewer'
  createdAt: string
  userEmail?: string
  userName?: string
}

export interface GitLabCredential {
  id: string
  gitlabUrl: string
  tokenHint: string   // last 4 chars only – never the full token
  label: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface WorkspaceRepo {
  id: string
  workspaceId: string
  credentialId: string
  projectId: string      // numeric "590" or path "fe/vibe-os-first-project"
  projectName: string
  projectUrl: string
  gitlabUrl: string      // denormalized from credential
  role: RepoRole
  isPrimary: boolean
  branchDefault: string
  branchStrategy: RepoBranchStrategy
  phaseTypes: string[]   // empty = all phases
  createdAt: string
  updatedAt: string
}

export interface Workspace {
  id: string
  name: string
  description: string
  progress: number
  currentPhaseId: string | null
  color: WorkspaceColor
  status: string
  phases: Phase[]
  agents: Agent[]
  activities: ActivityItem[]
  repos: WorkspaceRepo[]
  requirements: Requirement[]
  createdAt: string
  updatedAt: string
}

export interface Artifact {
  id: string
  workspaceId: string
  phaseId?: string
  taskId?: string
  requirementId?: string
  agentType: AgentType
  type: string
  title: string
  content: string
  metadata: string
  version: number
  createdAt: string
  updatedAt: string
}

export interface ArtifactMeta {
  id: string
  workspaceId: string
  phaseId?: string
  taskId?: string
  requirementId?: string
  agentType: AgentType
  type: string
  title: string
  contentSize: number
  metadata: string
  version: number
  createdAt: string
  updatedAt: string
}

export interface RequirementRelation {
  id: string
  sourceId: string
  targetId: string
  relationType: RelationType
  description: string
  targetTitle: string
  createdAt: string
}

export interface Requirement {
  id: string
  workspaceId: string
  title: string
  description: string
  status: RequirementStatus
  currentPhase: PhaseType
  priority?: TaskPriority
  iteration: string
  progress: number
  sortOrder: number
  taskCount: number
  doneCount: number
  tasks?: Task[]
  artifacts?: Artifact[]
  relations?: RequirementRelation[]
  createdAt: string
  updatedAt: string
}

export interface FeedbackSignal {
  id: string
  workspaceId: string
  agentType: string
  actionType: string
  originalOutput?: string
  modifiedOutput?: string
  context?: string
  createdAt: string
}

export interface ConversationSummary {
  id: string
  workspaceId: string
  sessionId?: string
  agentType?: string
  summary: string
  keyDecisions: string
  timeRangeFrom: string
  timeRangeTo: string
  messageCount: number
  createdAt: string
}

export interface ActivitySummary {
  id: string
  workspaceId: string
  summary: string
  keyEvents: string
  timeRangeFrom: string
  timeRangeTo: string
  activityCount: number
  createdAt: string
}

export type WorkflowEventType =
  | 'workflow:project_start'
  | 'workflow:phase_start'
  | 'workflow:phase_skip'
  | 'workflow:phase_complete'
  | 'workflow:task_start'
  | 'workflow:task_complete'
  | 'workflow:task_error'
  | 'workflow:project_complete'
  | 'workflow:project_error'

export interface WorkflowEvent {
  type: WorkflowEventType
  workspace_id?: string
  phase?: string
  task_id?: string
  task_title?: string
  index?: number
  total?: number
  reason?: string
  error?: string
  result_summary?: string
  /** Successfully completed tasks in this phase (phase_complete). */
  tasks_executed?: number
  /** Total tasks attempted in this phase; optional for older payloads. */
  tasks_total?: number
  /** Failed tasks in this phase when phase ended with errors. */
  tasks_failed?: number
  phases?: string[]
  success?: boolean
  requirement_id?: string
  requirement_title?: string
}

export interface TaskComment {
  id: string
  author: string
  content: string
  timestamp: string
}

export interface TaskAttachment {
  id: string
  name: string
  size: string
}

export interface RichAction {
  id: string
  label: string
  variant: 'primary' | 'secondary' | 'danger'
}

export interface RichBlock {
  type: 'action_card' | 'progress' | 'code' | 'task_card' | 'checklist'
  title?: string
  description?: string
  actions?: RichAction[]
  percent?: number
  statusLabel?: string
  language?: string
  code?: string
  taskTitle?: string
  taskStatus?: PhaseStatus
  taskPriority?: TaskPriority
  items?: { text: string; checked: boolean }[]
}

export interface Message {
  id: string
  role: 'user' | 'agent' | 'system'
  content: string
  richBlocks?: RichBlock[]
  agentType?: AgentType
  timestamp: string
  sessionId?: string
}
