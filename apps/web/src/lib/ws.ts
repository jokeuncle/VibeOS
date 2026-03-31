import { useWorkspaceStore } from '../stores/workspace'
import { useUIStore } from '../stores/ui'

/** Stop scheduling reconnects after this many failed connect/close cycles for the same workspace. */
const MAX_RECONNECT_ATTEMPTS = 8

let socket: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let heartbeatTimer: ReturnType<typeof setInterval> | null = null
let intentionalClose = false
let currentWorkspaceId: string | null = null
let refreshDebounce: ReturnType<typeof setTimeout> | null = null

/** Workspace we're trying to keep a socket for (retry budget resets when this id changes). */
let activeConnectionTargetId: string | null = null
let consecutiveReconnectFailures = 0
let gaveUpLogged = false

export function connectWebSocket(workspaceId: string | null) {
  if (workspaceId === currentWorkspaceId && socket?.readyState === WebSocket.OPEN) return

  if (!workspaceId || workspaceId.startsWith('ws-temp-')) {
    disconnectWebSocket()
    activeConnectionTargetId = null
    consecutiveReconnectFailures = 0
    gaveUpLogged = false
    return
  }

  if (workspaceId !== activeConnectionTargetId) {
    activeConnectionTargetId = workspaceId
    consecutiveReconnectFailures = 0
    gaveUpLogged = false
  }

  disconnectWebSocket()

  intentionalClose = false
  currentWorkspaceId = workspaceId

  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const url = `${protocol}://${window.location.host}/ws?workspace_id=${encodeURIComponent(workspaceId)}`

  socket = new WebSocket(url)

  socket.onopen = () => {
    console.log('[WS] connected', workspaceId)
    useUIStore.getState().setWsConnected(true)
    consecutiveReconnectFailures = 0
    gaveUpLogged = false
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (heartbeatTimer) clearInterval(heartbeatTimer)
    heartbeatTimer = setInterval(() => {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'ping' }))
      }
    }, 30_000)
  }

  socket.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data)
      handleWSEvent(msg)
    } catch {
      // ignore non-JSON
    }
  }

  socket.onclose = () => {
    socket = null
    useUIStore.getState().setWsConnected(false)
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null }
    if (intentionalClose) return
    consecutiveReconnectFailures += 1
    if (consecutiveReconnectFailures >= MAX_RECONNECT_ATTEMPTS) {
      if (!gaveUpLogged) {
        gaveUpLogged = true
        console.warn(
          `[WS] gave up after ${MAX_RECONNECT_ATTEMPTS} failed attempts (ws-gateway unreachable?).`,
          'Switch workspace or refresh to retry.',
        )
      }
      return
    }
    console.log(`[WS] disconnected, reconnecting in 3s (${consecutiveReconnectFailures}/${MAX_RECONNECT_ATTEMPTS})`)
    reconnectTimer = setTimeout(() => connectWebSocket(currentWorkspaceId), 3000)
  }

  socket.onerror = () => {
    socket?.close()
  }
}

export function disconnectWebSocket() {
  intentionalClose = true
  useUIStore.getState().setWsConnected(false)
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  socket?.close()
  socket = null
  currentWorkspaceId = null
}

function handleWSEvent(event: Record<string, any>) {
  const store = useWorkspaceStore.getState()
  const activeWsId = store.activeWorkspaceId

  if (event.type === 'chat_message' && event.workspaceId === activeWsId && event.payload) {
    const p = event.payload
    const existing = store.messages.find((m) => m.id === p.id)
    if (!existing) {
      store.addMessage({
        id: p.id || `ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role: p.role,
        content: p.content,
        agentType: p.agentType,
        timestamp: p.createdAt || new Date().toISOString(),
        sessionId: p.sessionId,
      })
    }
  }

  // Directly patch agent status in store – no API round-trip, immediate UI update
  if (event.type === 'agent:status' && event.workspaceId) {
    store.updateAgentStatus(
      event.workspaceId,
      event.agentType,
      event.status,
      event.detail,
    )
  }

  // Execution tracking — upsert / patch from ws-gateway events
  if (event.type === 'execution:start' && event.workspaceId === activeWsId && event.payload) {
    store.upsertExecution({
      id: event.payload.id || `exec-${Date.now()}`,
      workspaceId: event.workspaceId,
      requirementId: event.payload.requirementId,
      taskIds: event.payload.taskIds || [],
      intentType: event.payload.intentType || 'general_chat',
      intentSummary: event.payload.intentSummary || '',
      triggeredBy: event.payload.triggeredBy || 'nlp',
      userMessage: event.payload.userMessage,
      status: 'running',
      agentType: event.payload.agentType || 'pm',
      steps: event.payload.steps || [],
      resultType: event.payload.resultType || 'general',
      parentExecutionId: event.payload.parentExecutionId,
      startedAt: event.payload.startedAt || new Date().toISOString(),
      estimatedDuration: event.payload.estimatedDuration,
    })
  }
  if (event.type === 'execution:update' && event.workspaceId === activeWsId && event.payload) {
    const p = event.payload
    if (p.step) store.patchExecutionStep(p.executionId, p.step)
    if (p.status) store.patchExecutionStatus(p.executionId, p.status, {
      errorMessage: p.errorMessage,
      resultPayload: p.resultPayload,
    })
  }
  if (event.type === 'execution:complete' && event.workspaceId === activeWsId && event.payload) {
    store.patchExecutionStatus(event.payload.executionId, event.payload.status || 'success', {
      resultPayload: event.payload.resultPayload,
      errorMessage: event.payload.errorMessage,
    })
  }

  // Directly patch task status from workflow events broadcast via WS gateway
  if (event.workspaceId === activeWsId) {
    if (event.type === 'workflow:task_start' && event.task_id) {
      store.patchTaskStatus(event.workspaceId, event.task_id, 'in_progress')
    } else if (event.type === 'workflow:task_complete' && event.task_id) {
      store.patchTaskStatus(event.workspaceId, event.task_id, 'completed')
    } else if (event.type === 'workflow:task_error' && event.task_id) {
      store.patchTaskStatus(event.workspaceId, event.task_id, 'pending')
    }
  }

  // Only mirror workflow events from WS when the SSE stream is NOT active,
  // otherwise the SSE handler in runPhase/runProject already appends them.
  if (event.type?.startsWith('workflow:') && event.workspaceId === activeWsId) {
    if (!store.workflowRunning) {
      const prev = useWorkspaceStore.getState().workflowEvents
      const isDupe = prev.length > 0 && prev[prev.length - 1].type === event.type
        && prev[prev.length - 1].task_id === event.task_id
        && prev[prev.length - 1].phase === event.phase
      if (!isDupe) {
        useWorkspaceStore.setState({ workflowEvents: [...prev, event as any] })
      }
    }
  }

  // Generate real notifications from meaningful events
  const addNotification = useUIStore.getState().addNotification
  const wsId = event.workspaceId || undefined

  if (event.type === 'workflow:phase_complete' && event.phase) {
    addNotification({
      title: `${event.phase} phase completed`,
      description: event.tasks_executed ? `${event.tasks_executed} tasks executed` : '',
      time: new Date().toISOString(),
      workspaceId: wsId,
    })
  } else if (event.type === 'workflow:project_complete') {
    addNotification({
      title: 'Project workflow completed',
      description: event.success ? 'All phases finished successfully' : 'Completed with issues',
      time: new Date().toISOString(),
      workspaceId: wsId,
    })
  } else if (event.type === 'workflow:project_start') {
    addNotification({
      title: 'Project workflow started',
      description: event.phases?.join(' → ') || '',
      time: new Date().toISOString(),
      workspaceId: wsId,
    })
  } else if (event.type === 'workflow:task_error' && event.task_title) {
    addNotification({
      title: `Task failed: ${event.task_title}`,
      description: event.error || '',
      time: new Date().toISOString(),
      workspaceId: wsId,
    })
  } else if (event.type === 'agent:status' && event.status === 'error' && event.detail) {
    addNotification({
      title: `Agent error: ${event.agentType || 'unknown'}`,
      description: event.detail,
      time: new Date().toISOString(),
      workspaceId: wsId,
    })
  }

  // Debounced full refresh for structural events (tasks created, phases changed).
  // Skip agent:status events — they're patched directly above and a full refresh
  // would overwrite the transient running/error state with the server's stale idle.
  if (
    event.workspaceId &&
    event.workspaceId === activeWsId &&
    event.type !== 'agent:status'
  ) {
    if (refreshDebounce) clearTimeout(refreshDebounce)
    refreshDebounce = setTimeout(() => {
      useWorkspaceStore.getState().refreshActiveWorkspace()
    }, 500)
  }
}
