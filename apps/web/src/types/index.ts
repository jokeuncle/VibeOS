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

export interface Task {
  id: string
  title: string
  status: PhaseStatus
  assignedAgent?: AgentType
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
  phases: Phase[]
  agents: Agent[]
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
