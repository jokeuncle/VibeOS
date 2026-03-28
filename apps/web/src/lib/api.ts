import type { Workspace, Message, RichBlock, AgentType } from '../types'

async function request<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...opts?.headers },
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

export const workspaceApi = {
  list: () => request<{ data: Workspace[] }>('/api/workspaces').then(unwrap),

  get: (id: string) =>
    request<{ data: Workspace }>(`/api/workspaces/${id}`).then(unwrap),

  create: (name: string, description: string, color = 'indigo') =>
    request<{ data: Workspace }>('/api/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name, description, color }),
    }).then(unwrap),

  update: (id: string, updates: { name?: string; description?: string }) =>
    request<{ data: Workspace }>(`/api/workspaces/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }).then(unwrap),

  delete: (id: string) =>
    request<void>(`/api/workspaces/${id}`, { method: 'DELETE' }),

  createTask: (wsId: string, phaseId: string, title: string, description = '') =>
    request<{ data: any }>(`/api/workspaces/${wsId}/phases/${phaseId}/tasks`, {
      method: 'POST',
      body: JSON.stringify({ title, description }),
    }).then(unwrap),

  updateTask: (wsId: string, taskId: string, updates: Record<string, any>) =>
    request<{ data: any }>(`/api/workspaces/${wsId}/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }).then(unwrap),

  deleteTask: (wsId: string, taskId: string) =>
    request<void>(`/api/workspaces/${wsId}/tasks/${taskId}`, { method: 'DELETE' }),

  updatePhaseStatus: (wsId: string, phaseId: string, status: string) =>
    request<{ data: any }>(`/api/workspaces/${wsId}/phases/${phaseId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }).then(unwrap),

  reorderTasks: (wsId: string, phaseId: string, taskIds: string[]) =>
    request<void>(`/api/workspaces/${wsId}/phases/${phaseId}/tasks/reorder`, {
      method: 'PUT',
      body: JSON.stringify({ taskIds }),
    }),
}

export const agentApi = {
  nlp: (workspaceId: string, message: string) =>
    request<{
      intent: string
      summary: string
      target_agent: string
      result: any
    }>('/api/nlp', {
      method: 'POST',
      body: JSON.stringify({ workspace_id: workspaceId, message }),
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
    id: `msg-${Date.now()}`,
    role: 'agent',
    content,
    richBlocks: richBlocks.length > 0 ? richBlocks : undefined,
    agentType: resp.target_agent as AgentType,
    timestamp: new Date().toISOString(),
    sessionId,
  }
}

function mapAgentChatToMessage(
  resp: { reply: string; rich_blocks: any[] },
  agentType: string,
): Message {
  const richBlocks: RichBlock[] = []

  let content = resp.reply || ''

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

  return {
    id: `msg-${Date.now()}`,
    role: 'agent',
    content,
    richBlocks: richBlocks.length > 0 ? richBlocks : undefined,
    agentType: agentType as AgentType,
    timestamp: new Date().toISOString(),
  }
}

export { mapNLPResultToMessage, mapAgentChatToMessage }
