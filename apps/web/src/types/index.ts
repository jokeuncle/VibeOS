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

export const LABEL_COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'] as const
export type LabelColor = (typeof LABEL_COLORS)[number]

export interface Task {
  id: string
  title: string
  status: PhaseStatus
  description?: string
  priority?: TaskPriority
  labels?: LabelColor[]
  dueDate?: string
  assignedAgent?: AgentType
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
  type: PhaseType
  name: string
  status: PhaseStatus
  progress: number
  tasks: Task[]
  description: string
}

export interface Agent {
  id: string
  type: AgentType
  name: string
  status: AgentStatus
  currentTask?: string
  avatar: string
}

export interface Workspace {
  id: string
  name: string
  description: string
  progress: number
  currentPhaseId: string
  color: WorkspaceColor
  phases: Phase[]
  agents: Agent[]
  activities: ActivityItem[]
  createdAt: string
  updatedAt: string
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
  role: 'user' | 'agent'
  content: string
  richBlocks?: RichBlock[]
  agentType?: AgentType
  timestamp: string
  sessionId?: string
}
