import { create } from 'zustand'
import type { Workspace, Message, PhaseStatus, PhaseType, WorkspaceColor, ActivityItem, RichBlock, AgentType, Task, TaskPriority, LabelColor } from '../types'

const MOCK_WORKSPACES: Workspace[] = [
  {
    id: 'ws-1',
    name: 'User Points System',
    description: 'Gamification & loyalty program',
    progress: 42,
    currentPhaseId: 'arch',
    color: 'indigo',
    phases: [
      {
        id: 'req', type: 'requirement', name: 'Requirements', status: 'completed', progress: 100,
        description: 'User stories and acceptance criteria',
        tasks: [
          { id: 't1', title: 'User research interviews', status: 'completed' },
          { id: 't2', title: 'Write PRD document', status: 'completed' },
          { id: 't3', title: 'Define acceptance criteria', status: 'completed' },
        ],
      },
      {
        id: 'des', type: 'design', name: 'Design', status: 'completed', progress: 100,
        description: 'UX/UI design and prototyping',
        tasks: [
          { id: 't4', title: 'Wireframe user flows', status: 'completed' },
          { id: 't5', title: 'High-fidelity mockups', status: 'completed' },
        ],
      },
      {
        id: 'arch', type: 'architecture', name: 'Architecture', status: 'in_progress', progress: 60,
        description: 'System design and API contracts',
        tasks: [
          { id: 't6', title: 'Database schema design', status: 'completed' },
          { id: 't7', title: 'API endpoint specification', status: 'in_progress', assignedAgent: 'architecture' },
          { id: 't8', title: 'Cache strategy design', status: 'pending' },
        ],
      },
      {
        id: 'dev', type: 'development', name: 'Development', status: 'pending', progress: 0,
        description: 'Frontend and backend implementation',
        tasks: [
          { id: 't9', title: 'Backend API implementation', status: 'pending', assignedAgent: 'development' },
          { id: 't10', title: 'Frontend components', status: 'pending', assignedAgent: 'development' },
          { id: 't11', title: 'Integration testing', status: 'pending' },
        ],
      },
      {
        id: 'test', type: 'testing', name: 'Testing', status: 'pending', progress: 0,
        description: 'Quality assurance and testing',
        tasks: [
          { id: 't12', title: 'Test case generation', status: 'pending', assignedAgent: 'testing' },
          { id: 't13', title: 'Performance testing', status: 'pending' },
        ],
      },
      {
        id: 'deploy', type: 'deployment', name: 'Deployment', status: 'pending', progress: 0,
        description: 'CI/CD and release management',
        tasks: [
          { id: 't14', title: 'Pipeline configuration', status: 'pending', assignedAgent: 'cicd' },
          { id: 't15', title: 'Canary deployment', status: 'pending' },
        ],
      },
      {
        id: 'monitor', type: 'monitoring', name: 'Monitoring', status: 'pending', progress: 0,
        description: 'Observability and incident response',
        tasks: [
          { id: 't16', title: 'Alert rules setup', status: 'pending', assignedAgent: 'monitoring' },
          { id: 't17', title: 'Dashboard creation', status: 'pending' },
        ],
      },
    ],
    agents: [
      { id: 'a1', type: 'requirement', name: 'Req Agent', status: 'idle', avatar: 'R' },
      { id: 'a2', type: 'design', name: 'Design Agent', status: 'idle', avatar: 'D' },
      { id: 'a3', type: 'architecture', name: 'Arch Agent', status: 'running', currentTask: 'API endpoint specification', avatar: 'A' },
      { id: 'a4', type: 'development', name: 'Dev Agent', status: 'waiting', avatar: 'V' },
      { id: 'a5', type: 'testing', name: 'Test Agent', status: 'idle', avatar: 'T' },
      { id: 'a6', type: 'cicd', name: 'CI/CD Agent', status: 'idle', avatar: 'C' },
      { id: 'a7', type: 'monitoring', name: 'Mon Agent', status: 'idle', avatar: 'M' },
      { id: 'a8', type: 'pm', name: 'PM Agent', status: 'running', currentTask: 'Tracking milestone progress', avatar: 'P' },
    ],
    activities: [
      { id: 'a1', type: 'workspace_updated', description: 'Workspace created', timestamp: '2026-03-20T10:00:00Z' },
      { id: 'a2', type: 'phase_changed', description: 'Requirements → completed', timestamp: '2026-03-22T15:00:00Z' },
      { id: 'a3', type: 'task_created', description: 'Task "Design database schema" added', timestamp: '2026-03-24T09:00:00Z' },
      { id: 'a4', type: 'agent_action', description: 'Arch Agent started schema design', timestamp: '2026-03-27T14:20:00Z', agentType: 'architecture' },
    ],
    createdAt: '2026-03-20T10:00:00Z',
    updatedAt: '2026-03-27T14:30:00Z',
  },
  {
    id: 'ws-2',
    name: 'Payment Gateway',
    description: 'Third-party payment integration',
    progress: 15,
    currentPhaseId: 'req',
    color: 'emerald',
    phases: [
      {
        id: 'req', type: 'requirement', name: 'Requirements', status: 'in_progress', progress: 45,
        description: 'Payment flow requirements',
        tasks: [
          { id: 't20', title: 'Payment provider research', status: 'completed' },
          { id: 't21', title: 'Security compliance review', status: 'in_progress', assignedAgent: 'requirement' },
        ],
      },
      { id: 'des', type: 'design', name: 'Design', status: 'pending', progress: 0, description: 'Payment UI/UX', tasks: [] },
      { id: 'arch', type: 'architecture', name: 'Architecture', status: 'pending', progress: 0, description: 'Payment architecture', tasks: [] },
      { id: 'dev', type: 'development', name: 'Development', status: 'pending', progress: 0, description: 'Implementation', tasks: [] },
      { id: 'test', type: 'testing', name: 'Testing', status: 'pending', progress: 0, description: 'QA', tasks: [] },
      { id: 'deploy', type: 'deployment', name: 'Deployment', status: 'pending', progress: 0, description: 'Release', tasks: [] },
      { id: 'monitor', type: 'monitoring', name: 'Monitoring', status: 'pending', progress: 0, description: 'Observability', tasks: [] },
    ],
    agents: [
      { id: 'a10', type: 'requirement', name: 'Req Agent', status: 'running', currentTask: 'Security compliance review', avatar: 'R' },
      { id: 'a11', type: 'pm', name: 'PM Agent', status: 'idle', avatar: 'P' },
    ],
    activities: [
      { id: 'a5', type: 'workspace_updated', description: 'Workspace created', timestamp: '2026-03-25T09:00:00Z' },
      { id: 'a6', type: 'task_created', description: 'Task "Payment provider research" added', timestamp: '2026-03-26T10:00:00Z' },
    ],
    createdAt: '2026-03-25T09:00:00Z',
    updatedAt: '2026-03-27T11:00:00Z',
  },
]

function defaultPhases(): Workspace['phases'] {
  const types: PhaseType[] = ['requirement', 'design', 'architecture', 'development', 'testing', 'deployment', 'monitoring']
  return types.map((type) => ({
    id: type.slice(0, 3) + '-' + Date.now(),
    type,
    name: type,
    status: 'pending' as PhaseStatus,
    progress: 0,
    description: '',
    tasks: [],
  }))
}

interface WorkspaceState {
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  activePhaseId: string | null
  messages: Message[]

  setActiveWorkspace: (id: string | null) => void
  setActivePhase: (id: string | null) => void
  addMessage: (message: Message) => void
  sendNLPMessage: (input: string) => void

  createWorkspace: () => string
  updateWorkspace: (id: string, updates: Partial<Pick<Workspace, 'name' | 'description'>>) => void
  deleteWorkspace: (id: string) => void

  addTask: (workspaceId: string, phaseId: string, title: string) => void
  updateTask: (workspaceId: string, phaseId: string, taskId: string, updates: Partial<{ title: string; status: PhaseStatus; description: string; assignedAgent: AgentType; priority: TaskPriority; labels: LabelColor[]; dueDate: string }>) => void
  deleteTask: (workspaceId: string, phaseId: string, taskId: string) => void

  updatePhaseStatus: (workspaceId: string, phaseId: string, status: PhaseStatus) => void
  createWorkspaceFromTemplate: (name: string, description: string, color: WorkspaceColor) => string
  addActivity: (workspaceId: string, activity: Omit<ActivityItem, 'id' | 'timestamp'>) => void
  reorderTasks: (workspaceId: string, phaseId: string, taskIds: string[]) => void
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: MOCK_WORKSPACES,
  activeWorkspaceId: null,
  activePhaseId: null,
  messages: [],

  setActiveWorkspace: (id) =>
    set({ activeWorkspaceId: id, activePhaseId: null, messages: [] }),

  setActivePhase: (id) =>
    set({ activePhaseId: id }),

  addMessage: (message) =>
    set((s) => ({ messages: [...s.messages, message] })),

  sendNLPMessage: (input) => {
    const sessionId = `s-${Math.floor(Date.now() / 300000)}`
    const ts = new Date().toISOString()

    set((s) => ({
      messages: [...s.messages, {
        id: `msg-${Date.now()}`,
        role: 'user' as const,
        content: input,
        timestamp: ts,
        sessionId,
      }],
    }))

    const lower = input.toLowerCase()
    let agentType: AgentType = 'pm'
    let content = ''
    let richBlocks: RichBlock[] = []

    const mentionMatch = input.match(/@(\w+)/)
    if (mentionMatch) {
      const name = mentionMatch[1].toLowerCase()
      if (name.includes('dev')) agentType = 'development'
      else if (name.includes('arch')) agentType = 'architecture'
      else if (name.includes('test')) agentType = 'testing'
      else if (name.includes('design')) agentType = 'design'
      else if (name.includes('req')) agentType = 'requirement'
      else if (name.includes('ci') || name.includes('cd')) agentType = 'cicd'
    }

    if (lower.includes('deploy') || lower.includes('部署') || lower.includes('/deploy')) {
      agentType = 'cicd'
      content = 'Starting deployment pipeline. Building artifacts and running pre-deploy checks…'
      richBlocks = [
        { type: 'progress', title: 'Deployment Pipeline', percent: 35, statusLabel: 'Building…' },
        { type: 'action_card', title: 'Deploy to Staging', description: 'v0.2.1 → staging environment. 3 checks passed, 1 pending.', actions: [
          { id: 'approve', label: 'Approve', variant: 'primary' },
          { id: 'cancel', label: 'Cancel', variant: 'danger' },
        ]},
      ]
    } else if (lower.includes('create') || lower.includes('创建') || lower.includes('/create')) {
      content = 'Got it. I\'ve drafted a new task based on your description.'
      richBlocks = [
        { type: 'task_card', taskTitle: input.replace(/@\w+\s*/g, '').replace(/\/\w+\s*/g, '').trim() || 'New task', taskStatus: 'pending', taskPriority: 'p2' },
        { type: 'action_card', description: 'Shall I add this to the current phase?', actions: [
          { id: 'confirm', label: 'Confirm', variant: 'primary' },
          { id: 'modify', label: 'Modify', variant: 'secondary' },
        ]},
      ]
    } else if (lower.includes('status') || lower.includes('progress') || lower.includes('进度') || lower.includes('/report')) {
      content = 'Here\'s the current workspace progress overview:'
      richBlocks = [
        { type: 'checklist', title: 'Phase Status', items: [
          { text: 'Requirements — completed', checked: true },
          { text: 'Design — completed', checked: true },
          { text: 'Architecture — in progress', checked: false },
          { text: 'Development — pending', checked: false },
          { text: 'Testing — pending', checked: false },
        ]},
        { type: 'progress', title: 'Overall Progress', percent: 42, statusLabel: 'On track' },
      ]
    } else if (lower.includes('review') || lower.includes('审查') || lower.includes('/review')) {
      agentType = 'development'
      content = 'I\'ll run a code review on the latest changes.'
      richBlocks = [
        { type: 'code', language: 'typescript', code: '// auth.service.ts\nexport class AuthService {\n  async validateToken(token: string) {\n    const payload = jwt.verify(token, SECRET)\n    return payload\n  }\n}' },
        { type: 'action_card', title: 'Review Result', description: '2 suggestions found: missing error handling, token expiry not checked.', actions: [
          { id: 'apply', label: 'Apply fixes', variant: 'primary' },
          { id: 'dismiss', label: 'Dismiss', variant: 'secondary' },
        ]},
      ]
    } else {
      content = 'Understood. I\'ve analyzed your request and will coordinate with the relevant agents.'
      richBlocks = [
        { type: 'action_card', title: 'Next Steps', description: 'I can break this down into tasks and assign to the right agents. Shall I proceed?', actions: [
          { id: 'proceed', label: 'Proceed', variant: 'primary' },
          { id: 'detail', label: 'More detail', variant: 'secondary' },
        ]},
      ]
    }

    setTimeout(() => {
      set((s) => ({
        messages: [...s.messages, {
          id: `msg-${Date.now()}`,
          role: 'agent' as const,
          content,
          richBlocks,
          agentType,
          timestamp: new Date().toISOString(),
          sessionId,
        }],
      }))
    }, 600)
  },

  createWorkspace: () => {
    const id = `ws-${Date.now()}`
    set((s) => ({
      workspaces: [
        ...s.workspaces,
        {
          id,
          name: '',
          description: '',
          color: 'indigo' as WorkspaceColor,
          progress: 0,
          currentPhaseId: '',
          phases: defaultPhases(),
          agents: [],
          activities: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    }))
    return id
  },

  updateWorkspace: (id, updates) =>
    set((s) => ({
      workspaces: s.workspaces.map((w) =>
        w.id === id ? { ...w, ...updates, updatedAt: new Date().toISOString() } : w,
      ),
    })),

  deleteWorkspace: (id) =>
    set((s) => ({
      workspaces: s.workspaces.filter((w) => w.id !== id),
      activeWorkspaceId: s.activeWorkspaceId === id ? null : s.activeWorkspaceId,
    })),

  addTask: (workspaceId, phaseId, title) =>
    set((s) => ({
      workspaces: s.workspaces.map((w) =>
        w.id === workspaceId
          ? {
              ...w,
              updatedAt: new Date().toISOString(),
              phases: w.phases.map((p) =>
                p.id === phaseId
                  ? { ...p, tasks: [...p.tasks, { id: `t-${Date.now()}`, title, status: 'pending' as PhaseStatus }] }
                  : p,
              ),
            }
          : w,
      ),
    })),

  updateTask: (workspaceId, phaseId, taskId, updates) =>
    set((s) => ({
      workspaces: s.workspaces.map((w) =>
        w.id === workspaceId
          ? {
              ...w,
              updatedAt: new Date().toISOString(),
              phases: w.phases.map((p) =>
                p.id === phaseId
                  ? { ...p, tasks: p.tasks.map((t) => (t.id === taskId ? { ...t, ...updates } : t)) }
                  : p,
              ),
            }
          : w,
      ),
    })),

  deleteTask: (workspaceId, phaseId, taskId) =>
    set((s) => ({
      workspaces: s.workspaces.map((w) =>
        w.id === workspaceId
          ? {
              ...w,
              updatedAt: new Date().toISOString(),
              phases: w.phases.map((p) =>
                p.id === phaseId
                  ? { ...p, tasks: p.tasks.filter((t) => t.id !== taskId) }
                  : p,
              ),
            }
          : w,
      ),
    })),

  updatePhaseStatus: (workspaceId, phaseId, status) =>
    set((s) => ({
      workspaces: s.workspaces.map((w) =>
        w.id === workspaceId
          ? {
              ...w,
              updatedAt: new Date().toISOString(),
              phases: w.phases.map((p) =>
                p.id === phaseId ? { ...p, status, progress: status === 'completed' ? 100 : status === 'in_progress' ? 50 : 0 } : p,
              ),
            }
          : w,
      ),
    })),

  createWorkspaceFromTemplate: (name, description, color) => {
    const id = `ws-${Date.now()}`
    set((s) => ({
      workspaces: [
        ...s.workspaces,
        {
          id,
          name,
          description,
          color,
          progress: 0,
          currentPhaseId: '',
          phases: defaultPhases(),
          agents: [],
          activities: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    }))
    return id
  },

  addActivity: (workspaceId, activity) =>
    set((s) => ({
      workspaces: s.workspaces.map((w) =>
        w.id === workspaceId
          ? {
              ...w,
              activities: [
                { ...activity, id: `act-${Date.now()}`, timestamp: new Date().toISOString() },
                ...w.activities,
              ],
            }
          : w,
      ),
    })),

  reorderTasks: (workspaceId, phaseId, taskIds) =>
    set((s) => ({
      workspaces: s.workspaces.map((w) =>
        w.id === workspaceId
          ? {
              ...w,
              phases: w.phases.map((p) =>
                p.id === phaseId
                  ? { ...p, tasks: taskIds.map((id) => p.tasks.find((t) => t.id === id)).filter((t): t is Task => !!t) }
                  : p,
              ),
            }
          : w,
      ),
    })),
}))
