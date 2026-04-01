import type {
  Workspace, Message, RichBlock, AgentType, ActivityItem, AgentExecution,
  GitLabCredential, GitLabProjectResult, WorkspaceRepo, User, WorkspaceMember,
  Requirement, RequirementRelation, Task, Phase, Agent,
  Artifact, ArtifactMeta, FeedbackSignal, ConversationSummary, ActivitySummary,
  LabelColor, BudgetResponse, WorkspaceBudgetSettings, PipelinePhaseConfig,
} from '../types'

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('vibeos_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function request<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...getAuthHeader(), ...opts?.headers },
    ...opts,
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`${res.status}: ${body}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

function unwrap<T>(resp: { data?: T; error?: string }): T {
  if (resp.error) throw new Error(resp.error)
  return resp.data as T
}

function scaleProgress(val: number): number {
  return val <= 1 ? Math.round(val * 100) : val
}

function normalizeWorkspace(ws: Workspace): Workspace {
  return {
    ...ws,
    status: ws.status ?? 'active',
    progress: scaleProgress(ws.progress),
    phases: (ws.phases ?? []).map((p) => ({
      ...p,
      progress: scaleProgress(p.progress),
      tasks: p.tasks ?? [],
    })),
    agents: ws.agents ?? [],
    activities: ws.activities ?? [],
    repos: ws.repos ?? [],
    requirements: (ws.requirements ?? []).map((r) => ({
      ...r,
      progress: scaleProgress(r.progress),
      tasks: r.tasks ?? [],
      artifacts: r.artifacts ?? [],
      relations: r.relations ?? [],
    })),
  }
}

export const workspaceApi = {
  list: () =>
    request<{ data: Workspace[] }>('/api/workspaces')
      .then(unwrap)
      .then((list) => list.map(normalizeWorkspace)),

  get: (id: string) =>
    request<{ data: Workspace }>(`/api/workspaces/${id}`)
      .then(unwrap)
      .then(normalizeWorkspace),

  create: (name: string, description: string, color = 'indigo') =>
    request<{ data: Workspace }>('/api/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name, description, color }),
    })
      .then(unwrap)
      .then(normalizeWorkspace),

  update: (id: string, updates: { name?: string; description?: string }) =>
    request<{ data: Workspace }>(`/api/workspaces/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    })
      .then(unwrap)
      .then(normalizeWorkspace),

  delete: (id: string) =>
    request<void>(`/api/workspaces/${id}`, { method: 'DELETE' }),

  createTask: (wsId: string, phaseId: string, title: string, description = '') =>
    request<{ data: Task }>(`/api/workspaces/${wsId}/phases/${phaseId}/tasks`, {
      method: 'POST',
      body: JSON.stringify({ title, description }),
    }).then(unwrap),

  updateTask: (wsId: string, taskId: string, updates: Partial<{
    title: string; description: string; status: string;
    priority: string; labels: LabelColor[]; dueDate: string; assignedAgent: string
  }>) =>
    request<{ data: Task }>(`/api/workspaces/${wsId}/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }).then(unwrap),

  deleteTask: (wsId: string, taskId: string) =>
    request<void>(`/api/workspaces/${wsId}/tasks/${taskId}`, { method: 'DELETE' }),

  updatePhaseStatus: (wsId: string, phaseId: string, status: string) =>
    request<{ data: Phase }>(`/api/workspaces/${wsId}/phases/${phaseId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }).then(unwrap),

  /** All phases → pending; all tasks → pending; requirements → requirement phase */
  resetWorkspacePhases: (wsId: string) =>
    request<{ data: Workspace }>(`/api/workspaces/${wsId}/phases/reset`, { method: 'POST' })
      .then(unwrap)
      .then(normalizeWorkspace),

  reorderTasks: (wsId: string, phaseId: string, taskIds: string[]) =>
    request<void>(`/api/workspaces/${wsId}/phases/${phaseId}/tasks/reorder`, {
      method: 'PUT',
      body: JSON.stringify({ taskIds }),
    }),

  listActivities: (wsId: string, page = 1, pageSize = 50) =>
    request<{ data: ActivityItem[]; total: number; page: number; pageSize: number }>(
      `/api/workspaces/${wsId}/activities?page=${page}&pageSize=${pageSize}`,
    ),

  listArtifacts: (wsId: string) =>
    request<{ data: Artifact[] }>(`/api/workspaces/${wsId}/artifacts`).then(unwrap),

  listArtifactsMeta: (wsId: string) =>
    request<{ data: ArtifactMeta[] }>(`/api/workspaces/${wsId}/artifacts/meta`).then(unwrap),

  // Chat message persistence (cursor-paginated)
  listMessages: (wsId: string, cursor?: string, limit = 50) =>
    request<{ data: any[]; cursor?: string; hasMore: boolean }>(
      `/api/workspaces/${wsId}/messages?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
    ),

  saveMessage: (wsId: string, msg: {
    role: string; content: string; agentType?: string; richBlocks?: string;
    contextType?: string; requirementId?: string; executionId?: string;
  }) =>
    request<{ data: any }>(`/api/workspaces/${wsId}/messages`, {
      method: 'POST',
      body: JSON.stringify(msg),
    }).then(unwrap),

  deleteMessages: (wsId: string) =>
    request<{ data: string }>(`/api/workspaces/${wsId}/messages`, {
      method: 'DELETE',
    }).then(unwrap),

  // Workspace lifecycle
  archiveWorkspace: (wsId: string) =>
    request<{ data: string }>(`/api/workspaces/${wsId}/archive`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'archived' }),
    }).then(unwrap),

  unarchiveWorkspace: (wsId: string) =>
    request<{ data: string }>(`/api/workspaces/${wsId}/archive`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'active' }),
    }).then(unwrap),

  // AI-generated summaries
  listConversationSummaries: (wsId: string) =>
    request<{ data: ConversationSummary[] }>(`/api/workspaces/${wsId}/summaries/conversations`).then(unwrap),

  createConversationSummary: (wsId: string, body: {
    summary: string; keyDecisions: string; messageCount: number;
    sessionId?: string; agentType?: string
  }) =>
    request<{ data: ConversationSummary }>(`/api/workspaces/${wsId}/summaries/conversations`, {
      method: 'POST',
      body: JSON.stringify(body),
    }).then(unwrap),

  listActivitySummaries: (wsId: string) =>
    request<{ data: ActivitySummary[] }>(`/api/workspaces/${wsId}/summaries/activities`).then(unwrap),

  createActivitySummary: (wsId: string, body: {
    summary: string; keyEvents: string; activityCount: number
  }) =>
    request<{ data: ActivitySummary }>(`/api/workspaces/${wsId}/summaries/activities`, {
      method: 'POST',
      body: JSON.stringify(body),
    }).then(unwrap),

  // Agent status
  listAgents: (wsId: string) =>
    request<{ data: Agent[] }>(`/api/workspaces/${wsId}/agents`).then(unwrap),

  updateAgent: (wsId: string, agentId: string, updates: { status?: string; preferredModel?: string }) =>
    request<{ data: Agent }>(`/api/workspaces/${wsId}/agents/${agentId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }).then(unwrap),

  // Budget & usage
  getBudget: (wsId: string) =>
    request<{ data: BudgetResponse }>(`/api/workspaces/${wsId}/budget`).then(unwrap),

  updateBudgetSettings: (wsId: string, updates: { dailySpendLimitUsd?: number; alertThresholdPct?: number }) =>
    request<{ data: WorkspaceBudgetSettings }>(`/api/workspaces/${wsId}/budget`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }).then(unwrap),

  // Pipeline configuration
  getPipeline: (wsId: string) =>
    request<{ data: PipelinePhaseConfig[] }>(`/api/workspaces/${wsId}/pipeline`).then(unwrap),

  updatePipeline: (wsId: string, phases: { phaseKey: string; enabled: boolean; requireApproval: boolean; qualityGate?: string | null; graphId?: string | null }[]) =>
    request<{ data: PipelinePhaseConfig[] }>(`/api/workspaces/${wsId}/pipeline`, {
      method: 'PATCH',
      body: JSON.stringify({ phases }),
    }).then(unwrap),

  // Agent executions (persistent)
  listExecutions: (wsId: string, requirementId?: string, cursor?: string, limit = 50) => {
    const params = new URLSearchParams({ limit: String(limit) })
    if (requirementId) params.set('requirementId', requirementId)
    if (cursor) params.set('cursor', cursor)
    return request<{ data: AgentExecution[]; cursor?: string; hasMore: boolean }>(
      `/api/workspaces/${wsId}/executions?${params}`,
    )
  },

  createExecution: (wsId: string, body: {
    id?: string; requirementId?: string; taskIds?: string[]; intentType: string;
    intentSummary: string; triggeredBy: string; userMessage?: string;
    agentType: string; resultType?: string; parentExecutionId?: string;
  }) =>
    request<{ data: AgentExecution }>(`/api/workspaces/${wsId}/executions`, {
      method: 'POST',
      body: JSON.stringify(body),
    }).then(unwrap),

  updateExecution: (wsId: string, execId: string, body: {
    status?: string; steps?: string; resultPayload?: string;
    errorMessage?: string; taskIds?: string[]; chatMessageId?: string;
  }) =>
    request<{ data: AgentExecution }>(`/api/workspaces/${wsId}/executions/${execId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }).then(unwrap),

  getExecution: (wsId: string, execId: string) =>
    request<{ data: AgentExecution }>(`/api/workspaces/${wsId}/executions/${execId}`).then(unwrap),

  // Feedback signals
  createFeedbackSignal: (wsId: string, body: {
    agentType: string; actionType: string;
    originalOutput?: string; modifiedOutput?: string; context?: string
  }) =>
    request<{ data: FeedbackSignal }>(`/api/workspaces/${wsId}/feedback`, {
      method: 'POST',
      body: JSON.stringify(body),
    }).then(unwrap),

  listFeedbackSignals: (wsId: string, limit = 50) =>
    request<{ data: FeedbackSignal[] }>(`/api/workspaces/${wsId}/feedback?limit=${limit}`).then(unwrap),

  // GitLab repo bindings
  listRepos: (wsId: string) =>
    request<{ data: WorkspaceRepo[] }>(`/api/workspaces/${wsId}/repos`).then(unwrap),

  createRepo: (wsId: string, body: {
    credentialId: string
    projectId: string
    projectName: string
    projectUrl?: string
    role?: string
    isPrimary?: boolean
    branchDefault?: string
    branchStrategy?: string
    phaseTypes?: string[]
  }) =>
    request<{ data: WorkspaceRepo }>(`/api/workspaces/${wsId}/repos`, {
      method: 'POST',
      body: JSON.stringify(body),
    }).then(unwrap),

  updateRepo: (wsId: string, repoId: string, body: Partial<{
    projectName: string
    projectUrl: string
    role: string
    isPrimary: boolean
    branchDefault: string
    branchStrategy: string
    phaseTypes: string[]
  }>) =>
    request<{ data: WorkspaceRepo }>(`/api/workspaces/${wsId}/repos/${repoId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }).then(unwrap),

  deleteRepo: (wsId: string, repoId: string) =>
    request<void>(`/api/workspaces/${wsId}/repos/${repoId}`, { method: 'DELETE' }),

  testRepoConnection: (wsId: string, repoId: string) =>
    request<{ ok: boolean; projectName?: string; message?: string }>(
      `/api/workspaces/${wsId}/repos/${repoId}/test`,
      { method: 'POST' }
    ),

  listRequirements: async (wsId: string) => {
    const res = await request<{ data: Requirement[] }>(`/api/workspaces/${wsId}/requirements`)
    return unwrap<Requirement[]>(res)
  },
  createRequirement: async (wsId: string, data: { title: string; description: string; priority?: string }) => {
    const res = await request<{ data: Requirement }>(`/api/workspaces/${wsId}/requirements`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
    return unwrap<Requirement>(res)
  },
  getRequirement: async (wsId: string, reqId: string) => {
    const res = await request<{ data: Requirement }>(`/api/workspaces/${wsId}/requirements/${reqId}`)
    return unwrap<Requirement>(res)
  },
  updateRequirement: async (wsId: string, reqId: string, data: Partial<{ title: string; description: string; status: string; currentPhase: string; priority: string; iteration: string }>) => {
    const res = await request<{ data: Requirement }>(`/api/workspaces/${wsId}/requirements/${reqId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
    return unwrap<Requirement>(res)
  },
  deleteRequirement: async (wsId: string, reqId: string) => {
    await request<void>(`/api/workspaces/${wsId}/requirements/${reqId}`, { method: 'DELETE' })
  },
  resetRequirementPhase: async (wsId: string, reqId: string, phaseType: string) => {
    await request<void>(`/api/workspaces/${wsId}/requirements/${reqId}/phases/${phaseType}/reset`, {
      method: 'POST',
    })
  },
  addRequirementRelation: async (wsId: string, reqId: string, data: { targetId: string; relationType: string; description?: string }) => {
    const res = await request<{ data: RequirementRelation }>(`/api/workspaces/${wsId}/requirements/${reqId}/relations`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
    return unwrap<RequirementRelation>(res)
  },
  removeRequirementRelation: async (wsId: string, reqId: string, relationId: string) => {
    await request<void>(`/api/workspaces/${wsId}/requirements/${reqId}/relations/${relationId}`, { method: 'DELETE' })
  },
}

export const globalMessageApi = {
  list: (cursor?: string, limit = 50) =>
    request<{ data: any[]; cursor?: string; hasMore: boolean }>(
      `/api/messages?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
    ),

  save: (msg: { role: string; content: string; agentType?: string; richBlocks?: string }) =>
    request<{ data: any }>('/api/messages', {
      method: 'POST',
      body: JSON.stringify(msg),
    }).then(unwrap),

  clear: () =>
    request<{ data: string }>('/api/messages', {
      method: 'DELETE',
    }).then(unwrap),
}

export const gitlabCredentialApi = {
  list: () =>
    request<{ data: GitLabCredential[] }>('/api/gitlab/credentials').then(unwrap),

  create: (body: { gitlabUrl: string; token: string; label?: string; createdBy?: string }) =>
    request<{ data: GitLabCredential }>('/api/gitlab/credentials', {
      method: 'POST',
      body: JSON.stringify(body),
    }).then(unwrap),

  delete: (id: string) =>
    request<void>(`/api/gitlab/credentials/${id}`, { method: 'DELETE' }),

  searchProjects: (credId: string, search: string) =>
    request<{ data: GitLabProjectResult[] }>(
      `/api/gitlab/credentials/${credId}/projects?search=${encodeURIComponent(search)}`
    ).then(unwrap),
}

/**
 * @deprecated Use ExecutionSession.run() directly with workflow endpoint URLs.
 * Kept temporarily for any external callers; will be removed in a future release.
 */
export const workflowApi = {
  runTask: (workspaceId: string, taskId: string, userMessage = '') =>
    streamSSE('/api/workflow/run-task', {
      workspace_id: workspaceId,
      task_id: taskId,
      user_message: userMessage,
    }),

  runPhase: (workspaceId: string, phaseType: string, userMessage = '') =>
    streamSSE('/api/workflow/run-phase', {
      workspace_id: workspaceId,
      phase_type: phaseType,
      user_message: userMessage,
    }),

  runProject: (workspaceId: string, userMessage = '', startPhase?: string) =>
    streamSSE('/api/workflow/run-project', {
      workspace_id: workspaceId,
      user_message: userMessage,
      start_phase: startPhase,
    }),

  runRequirement: (wsId: string, reqId: string, phaseType?: string, userMessage?: string) =>
    streamSSE('/api/workflow/run-requirement', {
      workspace_id: wsId,
      requirement_id: reqId,
      phase_type: phaseType,
      user_message: userMessage || '',
    }),
}

export const agentApi = {
  classify: (message: string) =>
    request<{
      intent: string
      summary: string
      target_agent: string
      confidence: number
      is_ambiguous: boolean
      intent_label: { zh?: string; en?: string }
      agent_label: { zh?: string; en?: string }
      alternatives: { intent: string; summary: string; target_agent: string; intent_label: { zh?: string; en?: string } }[]
      slots?: Record<string, unknown>
    }>('/api/nlp/classify', {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),

  nlp: (workspaceId: string, message: string, context?: Record<string, unknown>) =>
    request<{
      intent: string
      summary: string
      target_agent: string
      result: any
      slots?: Record<string, unknown>
    }>('/api/nlp', {
      method: 'POST',
      body: JSON.stringify({
        workspace_id: workspaceId,
        message,
        ...(context && Object.keys(context).length > 0 ? { context } : {}),
      }),
    }),

  chat: (agentType: string, workspaceId: string, message: string) =>
    request<{ reply: string; rich_blocks: any[] }>(
      `/api/agents/${agentType}/chat`,
      {
        method: 'POST',
        body: JSON.stringify({ workspace_id: workspaceId, message }),
      },
    ),

}

export interface SSEEvent {
  event?: string
  data: string
}

export async function* streamSSE(
  url: string,
  body: object,
): AsyncGenerator<SSEEvent> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`SSE ${res.status}: ${await res.text().catch(() => '')}`)
  }
  if (!res.body) throw new Error('Response body is null')
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const parts = buffer.split('\n\n')
    buffer = parts.pop()!

    for (const part of parts) {
      if (!part.trim()) continue
      let eventName: string | undefined
      let dataLines: string[] = []
      for (const line of part.split('\n')) {
        if (line.startsWith('event: ')) eventName = line.slice(7).trim()
        else if (line.startsWith('data: ')) dataLines.push(line.slice(6))
        else if (line.startsWith(':')) continue
      }
      if (dataLines.length > 0) {
        const joined = dataLines.join('\n')
        if (joined === '[DONE]') continue
        yield { event: eventName, data: joined }
      }
    }
  }
}

function mapNLPResultToMessage(
  resp: { intent: string; summary: string; target_agent: string; result: any },
  sessionId: string,
): Message {
  const richBlocks: RichBlock[] = []
  const result = resp.result || {}

  if (result.payload) {
    const payload = result.payload

    for (const art of payload.artifacts || []) {
      richBlocks.push({
        type: 'code',
        title: art.title,
        language: art.type === 'diagram' ? 'text' : art.type === 'adr' ? 'markdown' : art.type,
        code: art.content,
      })
    }

    for (const t of payload.created_tasks || []) {
      richBlocks.push({
        type: 'task_card',
        taskTitle: t.title || t.data?.title,
        taskStatus: 'pending',
      })
    }
  }

  const content =
    result.payload?.summary || result.error || resp.summary || 'Request processed.'

  return {
    id: crypto.randomUUID(),
    role: 'agent',
    content,
    richBlocks: richBlocks.length > 0 ? richBlocks : undefined,
    agentType: resp.target_agent as AgentType,
    timestamp: new Date().toISOString(),
    sessionId,
    contextType: 'workspace' as const,
  }
}

function mapAgentChatToMessage(
  resp: { reply: string; rich_blocks: any[] },
  agentType: string,
): Message {
  const richBlocks: RichBlock[] = []

  let content = resp.reply || ''

  // Parse rich_blocks from the response payload
  if (resp.rich_blocks?.length) {
    for (const rb of resp.rich_blocks) {
      if (rb.type === 'code') {
        richBlocks.push({
          type: 'code',
          title: rb.metadata?.title || rb.title,
          language: rb.language,
          code: rb.content || rb.code,
        })
      } else if (rb.type === 'task_card') {
        richBlocks.push({
          type: 'task_card',
          taskTitle: rb.content || rb.taskTitle,
          taskStatus: 'pending',
        })
      }
    }
  }

  // Also try to parse structured JSON from the reply text
  if (richBlocks.length === 0) {
    try {
      const parsed = JSON.parse(content)
      content = parsed.summary || content

      for (const art of parsed.artifacts || []) {
        richBlocks.push({
          type: 'code',
          title: art.title,
          language: art.type === 'diagram' ? 'text' : art.type,
          code: art.content,
        })
      }
      for (const t of parsed.tasks || []) {
        richBlocks.push({
          type: 'task_card',
          taskTitle: t.title,
          taskStatus: 'pending',
        })
      }
    } catch {
      // reply is plain text
    }
  }

  return {
    id: crypto.randomUUID(),
    role: 'agent',
    content,
    richBlocks: richBlocks.length > 0 ? richBlocks : undefined,
    agentType: agentType as AgentType,
    timestamp: new Date().toISOString(),
    contextType: 'agent_dm' as const,
  }
}

export const authApi = {
  register: (email: string, password: string, name = '') =>
    request<{ data: { token: string; user: User } }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    }).then(unwrap),

  login: (email: string, password: string) =>
    request<{ data: { token: string; user: User } }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }).then(unwrap),

  me: () =>
    request<{ data: User }>('/api/auth/me').then(unwrap),
}

export const memberApi = {
  list: (wsId: string) =>
    request<{ data: WorkspaceMember[] }>(`/api/workspaces/${wsId}/members`).then(unwrap),

  add: (wsId: string, email: string, role = 'editor') =>
    request<{ data: WorkspaceMember }>(`/api/workspaces/${wsId}/members`, {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    }).then(unwrap),

  remove: (wsId: string, memberId: string) =>
    request<void>(`/api/workspaces/${wsId}/members/${memberId}`, { method: 'DELETE' }),
}

export const feedbackApi = {
  send: (body: {
    workspace_id: string
    message_id?: string
    agent_type?: string
    action_type: 'approve' | 'reject' | 'edit'
    original_output?: string
    modified_output?: string
    context?: Record<string, unknown>
  }) =>
    request<{ status: string; error?: string }>('/api/feedback', {
      method: 'POST',
      body: JSON.stringify(body),
    }).then((resp) => {
      if (resp.status === 'error') throw new Error(resp.error || 'Feedback failed')
    }),
}

/** Proxied to platform/llm-gateway (8030). */
const PLATFORM_LLM = '/svc/llm'
/** Proxied to platform/memory-service (8050). */
const PLATFORM_MEMORY = '/svc/memory'
/** Proxied to platform/rag-pipeline (8060). */
const PLATFORM_RAG = '/svc/rag'
/** Proxied to platform/knowledge-service (8070). */
const PLATFORM_KNOWLEDGE = '/svc/knowledge'

async function platformRequest<T>(url: string, opts?: RequestInit): Promise<T> {
  const isJsonBody = typeof opts?.body === 'string'
  const res = await fetch(url, {
    headers: {
      ...getAuthHeader(),
      ...(isJsonBody ? { 'Content-Type': 'application/json' } : {}),
      ...opts?.headers,
    },
    ...opts,
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`${res.status}: ${body.slice(0, 400)}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export interface RagSearchHit {
  text: string
  score?: number
  doc_id?: string
  title?: string
  doc_type?: string
  workspace_id?: string
  metadata?: Record<string, unknown>
}

export interface KnowledgeDistillResponse {
  workspace_id: string
  target_access_level: string
  extracted?: { patterns?: unknown[]; decisions?: unknown[]; lessons?: unknown[] }
  stored_count?: number
  items?: unknown[]
}

export const platformApi = {
  memory: {
    list: (workspaceId: string) =>
      platformRequest<{ memories: Record<string, unknown>[] }>(
        `${PLATFORM_MEMORY}/api/memory/all?${new URLSearchParams({ workspace_id: workspaceId })}`,
      ),
    add: (workspaceId: string, content: string, metadata: Record<string, unknown> = {}) =>
      platformRequest<{ status: string }>(`${PLATFORM_MEMORY}/api/memory/add`, {
        method: 'POST',
        body: JSON.stringify({
          content,
          workspace_id: workspaceId,
          metadata: { layer: 'project', ...metadata },
        }),
      }),
    delete: (memoryId: string) =>
      platformRequest<{ status: string }>(
        `${PLATFORM_MEMORY}/api/memory/${encodeURIComponent(memoryId)}`,
        { method: 'DELETE' },
      ),
    preferences: (workspaceId: string) =>
      platformRequest<{ workspace_id: string; preferences: unknown }>(
        `${PLATFORM_MEMORY}/api/preferences/${encodeURIComponent(workspaceId)}`,
      ),
  },
  rag: {
    search: (workspaceId: string, query: string, topK = 8) =>
      platformRequest<{ query: string; workspace_id: string; results: RagSearchHit[] }>(
        `${PLATFORM_RAG}/api/search`,
        { method: 'POST', body: JSON.stringify({ workspace_id: workspaceId, query, top_k: topK }) },
      ),
    indexDocuments: (
      workspaceId: string,
      documents: { title: string; content: string; doc_type?: string }[],
    ) =>
      platformRequest<Record<string, unknown>>(`${PLATFORM_RAG}/api/index/documents`, {
        method: 'POST',
        body: JSON.stringify({ workspace_id: workspaceId, documents }),
      }),
    listCollections: () =>
      platformRequest<{ collections: { workspace_id: string; points_count: number }[] }>(
        `${PLATFORM_RAG}/api/collections`,
      ),
  },
  knowledge: {
    search: (query: string, limit = 20) =>
      platformRequest<{ results: Record<string, unknown>[]; count: number }>(
        `${PLATFORM_KNOWLEDGE}/api/knowledge/search`,
        { method: 'POST', body: JSON.stringify({ query, limit, access_level: 'enterprise' }) },
      ),
    distill: (workspaceId: string, targetAccessLevel: 'team' | 'bu' | 'enterprise' = 'team') =>
      platformRequest<KnowledgeDistillResponse>(`${PLATFORM_KNOWLEDGE}/api/distill`, {
        method: 'POST',
        body: JSON.stringify({
          workspace_id: workspaceId,
          target_access_level: targetAccessLevel,
        }),
      }),
  },
}

// ---------------------------------------------------------------------------
// Trust / Autonomy API (proxied to llm-gateway via /svc/llm)
// ---------------------------------------------------------------------------

export interface TrustScore {
  model: string
  agent_type: string
  score: number
  autonomy: 'supervised' | 'semi_autonomous' | 'autonomous'
  total_calls: number
  success_rate?: number
}

export const trustApi = {
  list: () =>
    platformRequest<{ scores: TrustScore[] }>(`${PLATFORM_LLM}/api/trust`).then(
      (r) => r.scores,
    ),

  get: (model: string, agentType: string) =>
    platformRequest<TrustScore>(`${PLATFORM_LLM}/api/trust/${model}/${agentType}`),

  checkAutonomy: (model: string, agentType: string) =>
    platformRequest<{ model: string; agent_type: string; autonomy: string; auto_approve: boolean }>(
      `${PLATFORM_LLM}/api/trust/autonomy/${model}/${agentType}`,
    ),
}

// ---------------------------------------------------------------------------
// Approval API (governance gate)
// ---------------------------------------------------------------------------

export const approvalApi = {
  resolve: (approvalKey: string, approved: boolean) =>
    request<{ status: string }>('/api/workflow/approve', {
      method: 'POST',
      body: JSON.stringify({ approval_key: approvalKey, approved }),
    }),
}

// ---------------------------------------------------------------------------
// Global Registry API (intents, task templates, capabilities)
// ---------------------------------------------------------------------------

export interface RegistryIntent {
  id: string
  name: string
  labelZh: string
  labelEn: string
  hint: string
  slotsSchema: Record<string, unknown>
  contextScopes: string[]
  priority: number
  enabled: boolean
  source: string
  createdAt: string
  updatedAt: string
}

export interface RegistryTaskTemplate {
  id: string
  intentPattern: string
  context: string
  taskType: string
  requiredCapabilities: string[]
  paramsMapping: Record<string, unknown>
  handlerType: string
  handlerRef: string
  graphDef: Record<string, unknown>
  stateSchema: Record<string, unknown>
  priority: number
  enabled: boolean
  source: string
  createdAt: string
  updatedAt: string
}

export interface RegistryCapability {
  id: string
  name: string
  description: string
  provider: string
  endpoint: string
  inputSchema: Record<string, unknown>
  outputSchema: Record<string, unknown>
  constraints: Record<string, unknown>
  version: string
  health: string
  lastHeartbeat: string | null
  nodeConfigSchema: Record<string, unknown>
  supportsStreaming: boolean
  enabled: boolean
  source: string
  sourceType: string
  transport: string
  workspaceId: string | null
  mcpConfig: Record<string, unknown>
  skillConfig: Record<string, unknown>
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface WorkspaceGraph {
  id: string
  workspaceId: string
  name: string
  description: string
  sourceTemplateId: string | null
  graphDef: Record<string, unknown>
  stateSchema: Record<string, unknown>
  config: Record<string, unknown>
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export const workspaceGraphApi = {
  list: (workspaceId: string) =>
    request<{ data: WorkspaceGraph[] }>(`/api/workspaces/${workspaceId}/graphs`).then(unwrap),

  get: (workspaceId: string, graphId: string) =>
    request<{ data: WorkspaceGraph }>(`/api/workspaces/${workspaceId}/graphs/${graphId}`).then(unwrap),

  getActive: (workspaceId: string) =>
    request<{ data: WorkspaceGraph | null }>(`/api/workspaces/${workspaceId}/graphs/active`).then(unwrap),

  create: (workspaceId: string, req: {
    name: string
    description?: string
    sourceTemplateId?: string
    graphDef?: Record<string, unknown>
    stateSchema?: Record<string, unknown>
    config?: Record<string, unknown>
    isActive?: boolean
  }) =>
    request<{ data: WorkspaceGraph }>(`/api/workspaces/${workspaceId}/graphs`, {
      method: 'POST',
      body: JSON.stringify(req),
    }).then(unwrap),

  update: (workspaceId: string, graphId: string, req: {
    name?: string
    description?: string
    graphDef?: Record<string, unknown>
    stateSchema?: Record<string, unknown>
    config?: Record<string, unknown>
    isActive?: boolean
  }) =>
    request<{ data: WorkspaceGraph }>(`/api/workspaces/${workspaceId}/graphs/${graphId}`, {
      method: 'PUT',
      body: JSON.stringify(req),
    }).then(unwrap),

  delete: (workspaceId: string, graphId: string) =>
    request<{ data: string }>(`/api/workspaces/${workspaceId}/graphs/${graphId}`, { method: 'DELETE' }),

  activate: (workspaceId: string, graphId: string) =>
    request<{ data: string }>(`/api/workspaces/${workspaceId}/graphs/${graphId}/activate`, { method: 'POST' }),
}

export const registryApi = {
  listIntents: (enabledOnly = true) =>
    request<{ data: RegistryIntent[] }>(
      `/api/registry/intents${enabledOnly ? '' : '?enabled=false'}`,
    ).then(unwrap),

  upsertIntent: (intent: Partial<RegistryIntent> & { name: string }) =>
    request<{ data: RegistryIntent }>('/api/registry/intents', {
      method: 'POST',
      body: JSON.stringify(intent),
    }).then(unwrap),

  deleteIntent: (name: string) =>
    request<{ data: string }>(`/api/registry/intents/${name}`, { method: 'DELETE' }),

  listTemplates: (enabledOnly = true) =>
    request<{ data: RegistryTaskTemplate[] }>(
      `/api/registry/templates${enabledOnly ? '' : '?enabled=false'}`,
    ).then(unwrap),

  resolveTemplate: (intent: string, context = '*') =>
    request<{ data: RegistryTaskTemplate }>(
      `/api/registry/templates/resolve?intent=${encodeURIComponent(intent)}&context=${context}`,
    ).then(unwrap),

  createTemplate: (t: Partial<RegistryTaskTemplate> & { intentPattern: string }) =>
    request<{ data: RegistryTaskTemplate }>('/api/registry/templates', {
      method: 'POST',
      body: JSON.stringify(t),
    }).then(unwrap),

  deleteTemplate: (id: string) =>
    request<{ data: string }>(`/api/registry/templates/${id}`, { method: 'DELETE' }),

  listCapabilities: (provider?: string) =>
    request<{ data: RegistryCapability[] }>(
      `/api/registry/capabilities${provider ? `?provider=${provider}` : ''}`,
    ).then(unwrap),

  upsertCapability: (c: Partial<RegistryCapability> & { name: string; provider: string }) =>
    request<{ data: RegistryCapability }>('/api/registry/capabilities', {
      method: 'POST',
      body: JSON.stringify(c),
    }).then(unwrap),

  deleteCapability: (name: string, provider: string) =>
    request<{ data: string }>(
      `/api/registry/capabilities/${name}?provider=${encodeURIComponent(provider)}`,
      { method: 'DELETE' },
    ),

  registerManifest: (manifest: {
    agentType: string
    version?: string
    intents?: Partial<RegistryIntent>[]
    templates?: Partial<RegistryTaskTemplate>[]
    capabilities?: Partial<RegistryCapability>[]
  }) =>
    request<{ data: { intents: number; templates: number; capabilities: number } }>(
      '/api/registry/manifest',
      { method: 'POST', body: JSON.stringify(manifest) },
    ).then(unwrap),

  validateGraph: (graphDef: Record<string, unknown>) =>
    request<{ data: { valid: boolean; errors: string[] } }>(
      '/api/graph/validate',
      { method: 'POST', body: JSON.stringify({ graphDef }) },
    ).then(unwrap),

  syncCapabilities: (workspaceId: string, sourceTypes: string[] = ['mcp', 'skill']) =>
    request<{ data: Record<string, { name: string; provider: string }[]> }>(
      '/api/capabilities/sync',
      { method: 'POST', body: JSON.stringify({ workspace_id: workspaceId, source_types: sourceTypes }) },
    ).then(unwrap),
}

// ---------------------------------------------------------------------------
// Extensibility API (MCP servers, tool configs, skills, user context)
// ---------------------------------------------------------------------------

export interface MCPServerEntry {
  id: string
  workspaceId?: string
  name: string
  transport: 'stdio' | 'sse' | 'streamable-http'
  config: Record<string, unknown>
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface ToolConfigEntry {
  id: string
  workspaceId?: string
  name: string
  description: string
  parameters: Record<string, unknown>
  implementation: Record<string, unknown>
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface SkillEntry {
  id: string
  workspaceId?: string
  name: string
  description: string
  config: Record<string, unknown>
  version: string
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface UserContextEntry {
  id: string
  userId: string
  workspaceId?: string
  customInstructions: string
  preferences: Record<string, unknown>
  activeSkills: string[]
  createdAt: string
  updatedAt: string
}

export const extApi = {
  listMCPServers: (workspaceId?: string) =>
    request<{ data: MCPServerEntry[] }>(
      `/api/ext/mcp-servers${workspaceId ? `?workspaceId=${workspaceId}` : ''}`,
    ).then(unwrap),

  createMCPServer: (body: Partial<MCPServerEntry> & { name: string; transport: string }) =>
    request<{ data: MCPServerEntry }>('/api/ext/mcp-servers', {
      method: 'POST',
      body: JSON.stringify(body),
    }).then(unwrap),

  updateMCPServer: (id: string, body: Partial<MCPServerEntry>) =>
    request<{ data: MCPServerEntry }>(`/api/ext/mcp-servers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }).then(unwrap),

  deleteMCPServer: (id: string) =>
    request<{ data: string }>(`/api/ext/mcp-servers/${id}`, { method: 'DELETE' }),

  listToolConfigs: (workspaceId?: string) =>
    request<{ data: ToolConfigEntry[] }>(
      `/api/ext/tool-configs${workspaceId ? `?workspaceId=${workspaceId}` : ''}`,
    ).then(unwrap),

  createToolConfig: (body: Partial<ToolConfigEntry> & { name: string }) =>
    request<{ data: ToolConfigEntry }>('/api/ext/tool-configs', {
      method: 'POST',
      body: JSON.stringify(body),
    }).then(unwrap),

  deleteToolConfig: (id: string) =>
    request<{ data: string }>(`/api/ext/tool-configs/${id}`, { method: 'DELETE' }),

  listSkills: (workspaceId?: string) =>
    request<{ data: SkillEntry[] }>(
      `/api/ext/skills${workspaceId ? `?workspaceId=${workspaceId}` : ''}`,
    ).then(unwrap),

  createSkill: (body: Partial<SkillEntry> & { name: string; config: Record<string, unknown> }) =>
    request<{ data: SkillEntry }>('/api/ext/skills', {
      method: 'POST',
      body: JSON.stringify(body),
    }).then(unwrap),

  deleteSkill: (id: string) =>
    request<{ data: string }>(`/api/ext/skills/${id}`, { method: 'DELETE' }),

  getUserContext: (userId: string, workspaceId?: string) =>
    request<{ data: UserContextEntry }>(
      `/api/ext/user-context?userId=${userId}${workspaceId ? `&workspaceId=${workspaceId}` : ''}`,
    ).then(unwrap),

  upsertUserContext: (body: {
    userId: string
    workspaceId?: string
    customInstructions?: string
    preferences?: Record<string, unknown>
    activeSkills?: string[]
  }) =>
    request<{ data: UserContextEntry }>('/api/ext/user-context', {
      method: 'POST',
      body: JSON.stringify(body),
    }).then(unwrap),
}

export { mapNLPResultToMessage, mapAgentChatToMessage }
