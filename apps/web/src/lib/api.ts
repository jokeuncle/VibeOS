import type { Workspace, Message, RichBlock, AgentType, ActivityItem } from '../types'

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

function scaleProgress(val: number): number {
  return val <= 1 ? Math.round(val * 100) : val
}

function normalizeWorkspace(ws: Workspace): Workspace {
  return {
    ...ws,
    progress: scaleProgress(ws.progress),
    phases: ws.phases.map((p) => ({
      ...p,
      progress: scaleProgress(p.progress),
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

  listActivities: (wsId: string, page = 1, pageSize = 50) =>
    request<{ data: ActivityItem[]; total: number; page: number; pageSize: number }>(
      `/api/workspaces/${wsId}/activities?page=${page}&pageSize=${pageSize}`,
    ),

  listArtifacts: (wsId: string) =>
    request<{ data: any[] }>(`/api/workspaces/${wsId}/artifacts`).then(unwrap),

  listArtifactsByPhase: (wsId: string, phaseId: string) =>
    request<{ data: any[] }>(`/api/workspaces/${wsId}/phases/${phaseId}/artifacts`).then(unwrap),
}

export const workflowApi = {
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

  nlpStream: (workspaceId: string, message: string) =>
    streamSSE('/api/nlp/stream', { workspace_id: workspaceId, message }),

  chatStream: (agentType: string, workspaceId: string, message: string) =>
    streamSSE(`/api/agents/${agentType}/chat/stream`, {
      workspace_id: workspaceId,
      message,
    }),
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`SSE ${res.status}: ${await res.text().catch(() => '')}`)
  }
  const reader = res.body!.getReader()
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
  }
}

export { mapNLPResultToMessage, mapAgentChatToMessage }
