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
  type: 'task_created' | 'task_updated' | 'phase_changed' | 'agent_action' | 'workspace_updated'
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

export interface Message {
  id: string
  role: 'user' | 'agent'
  content: string
  agentType?: AgentType
  timestamp: string
}
