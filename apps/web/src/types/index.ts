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

export type RequirementStatus = 'draft' | 'designing' | 'ready' | 'in_progress' | 'awaiting_approval' | 'completed'
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
  lastExecutionId?: string
  executionCount?: number
  graphNodeId?: string
  graphId?: string
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
  preferredModel?: string
  /** Workspace-specific addendum; persisted in Postgres `agents.system_prompt_template`. */
  systemPromptTemplate?: string
  /** Tool names enabled for this workspace agent; persisted as JSONB array. */
  toolManifest?: string[]
  /** Optional JSON object; persisted as JSONB. */
  capabilities?: Record<string, unknown>
  avatar: string
  enabled: boolean
  requireApproval: boolean
  qualityGate?: string | null
  graphId?: string | null
  trustThreshold: number
  createdAt: string
  updatedAt: string
}

export interface AgentProfile extends Agent {
  graphName?: string | null
}

// ---------------------------------------------------------------------------
// Budget & usage types
// ---------------------------------------------------------------------------

export interface WorkspaceBudgetSettings {
  workspaceId: string
  dailySpendLimitUsd: number
  alertThresholdPct: number
  updatedAt: string
}

export interface AgentUsageStat {
  agentType: string
  tokensTotal: number
  costUsd: number
  model: string
  requestCount: number
}

export interface BudgetResponse {
  settings: WorkspaceBudgetSettings
  usedTodayUsd: number
  tokensToday: number
  agentUsage: AgentUsageStat[]
  weekLabels: string[]
  weekSpendUsd: number[]
}

// ---------------------------------------------------------------------------
// Pipeline configuration types
// ---------------------------------------------------------------------------

export type PipelinePhaseKey =
  | 'requirement'
  | 'architecture'
  | 'design'
  | 'development'
  | 'testing'
  | 'cicd'
  | 'monitoring'

export interface PipelinePhaseConfig {
  workspaceId: string
  phaseKey: PipelinePhaseKey
  enabled: boolean
  requireApproval: boolean
  qualityGate?: string | null
  graphId?: string | null
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

export interface GitLabProjectResult {
  id: string
  name: string
  pathWithNamespace: string
  webUrl: string
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
  executionId?: string
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
  executionId?: string
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

// ---------------------------------------------------------------------------
// Tool invocation & content segments (Claude-style interleaved rendering)
// ---------------------------------------------------------------------------

export interface ToolInvocation {
  id: string
  toolName: string
  displayName: string
  status: 'calling' | 'completed' | 'error' | 'awaiting_confirmation' | 'confirmed' | 'rejected'
  input?: Record<string, unknown>
  output?: string
  error?: string
  durationMs?: number
  confirmationKey?: string
}

export type ContentSegment =
  | { kind: 'text'; text: string }
  | { kind: 'tool_use'; invocation: ToolInvocation }
  | { kind: 'tool_confirmation'; invocation: ToolInvocation }
  | { kind: 'block'; block: RichBlock }

/**
 * Unified event categories for the SSE protocol.
 * All events follow the format: `<category>:<action>`
 */
export type UnifiedEventCategory =
  | 'session'
  | 'intent'
  | 'timeline'
  | 'content'
  | 'tool'
  | 'task'
  | 'phase'
  | 'project'
  | 'graph'
  | 'agent'

export interface UnifiedEvent {
  category: UnifiedEventCategory
  action: string
  sid: string
  data: Record<string, any>
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

export interface ClarificationOption {
  id: string
  label: string
  intent: string
  agentType?: AgentType
}

export type ErrorSeverity = 'intent_unclear' | 'capability_limit' | 'agent_unavailable' | 'system_error' | 'warning'

export interface ExecutionStep {
  id: string
  label: string
  status: 'pending' | 'running' | 'completed' | 'error'
  detail?: string
}

// ---------------------------------------------------------------------------
// Agent execution tracking (NLP-triggered tasks)
// ---------------------------------------------------------------------------

export type ExecutionStatus = 'queued' | 'running' | 'success' | 'failed' | 'cancelled'

export type ExecutionResultType =
  | 'pipeline'
  | 'code_gen'
  | 'design_doc'
  | 'test_report'
  | 'requirement_analysis'
  | 'architecture'
  | 'deployment'
  | 'general'
  | (string & {})

export interface AgentExecution {
  id: string
  workspaceId: string
  requirementId?: string
  taskIds: string[]
  intentType: string
  intentSummary: string
  triggeredBy: 'nlp' | 'workflow' | 'manual'
  userMessage?: string
  chatMessageId?: string
  status: ExecutionStatus
  agentType: AgentType
  steps: ExecutionStep[]
  resultType: ExecutionResultType
  resultPayload?: Record<string, unknown>
  errorMessage?: string
  parentExecutionId?: string
  startedAt: string
  completedAt?: string
  estimatedDuration?: string
}

export type NlpActionType =
  | 'workspace_create'
  | 'task_execute'
  | 'phase_execute'
  | 'confirm'
  | 'navigate'
  | (string & {})

export type ConversationContext = 'home' | 'workspace' | 'requirement' | 'agent_dm'

export interface RichBlock {
  type:
    | 'action_card' | 'progress' | 'code' | 'task_card' | 'checklist'
    | 'requirement_preview'
    | 'intent_feedback'
    | 'clarification'
    | 'error_card'
    | 'cta_actions'
    | 'execution_timeline'
    | 'nlp_action'
    | 'execution_result'
    | 'project_summary'
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
  reqTitle?: string
  reqDescription?: string
  reqPriority?: string
  // intent_feedback fields
  intentLabel?: string
  intentId?: string
  agentLabel?: string
  agentId?: string
  confidence?: number
  /** pm-agent structured NLU slots (e.g. workspace_create) */
  nluSlots?: Record<string, unknown>
  // clarification fields
  clarifyPrompt?: string
  clarifyOptions?: ClarificationOption[]
  // error_card fields
  errorSeverity?: ErrorSeverity
  errorMessage?: string
  errorHints?: string[]
  errorActions?: RichAction[]
  // cta_actions fields
  ctaActions?: RichAction[]
  // execution_timeline fields
  steps?: ExecutionStep[]
  // nlp_action fields
  actionType?: NlpActionType
  actionPayload?: Record<string, unknown>
  actionLabel?: string
  actionVariant?: 'primary' | 'secondary' | 'danger'
  // execution_result fields
  executionId?: string
  resultType?: ExecutionResultType
  resultSummary?: string
  linkedWorkspaceId?: string
  linkedRequirementId?: string
  linkedTaskIds?: string[]
}

export interface Message {
  id: string
  role: 'user' | 'agent' | 'system'
  content: string
  richBlocks?: RichBlock[]
  /** Ordered content segments for interleaved tool-call rendering. */
  segments?: ContentSegment[]
  agentType?: AgentType
  timestamp: string
  sessionId?: string
  contextType: ConversationContext
  workspaceId?: string
  requirementId?: string
  executionId?: string
}
