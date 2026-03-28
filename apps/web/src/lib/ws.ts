import { useWorkspaceStore } from '../stores/workspace'

let socket: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let intentionalClose = false
let currentWorkspaceId: string | null = null
let refreshDebounce: ReturnType<typeof setTimeout> | null = null

export function connectWebSocket(workspaceId: string | null) {
  if (workspaceId === currentWorkspaceId && socket?.readyState === WebSocket.OPEN) return

  disconnectWebSocket()
  if (!workspaceId) return

  intentionalClose = false
  currentWorkspaceId = workspaceId

  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const url = `${protocol}://${window.location.host}/ws?workspace_id=${encodeURIComponent(workspaceId)}`

  socket = new WebSocket(url)

  socket.onopen = () => {
    console.log('[WS] connected', workspaceId)
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
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
    if (intentionalClose) return
    console.log('[WS] disconnected, reconnecting in 3s')
    reconnectTimer = setTimeout(() => connectWebSocket(currentWorkspaceId), 3000)
  }

  socket.onerror = () => {
    socket?.close()
  }
}

export function disconnectWebSocket() {
  intentionalClose = true
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

  if (event.type === 'agent:log') {
    store.appendExecutionLog(event.workspaceId, {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: event.payload?.timestamp || new Date().toISOString(),
      agent: event.payload?.agent || 'pm',
      level: event.payload?.level || 'info',
      message: event.payload?.message || '',
      taskId: event.payload?.taskId,
    })
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

  // Directly patch task status from workflow events broadcast via WS gateway
  if (event.workspaceId === activeWsId) {
    if (event.type === 'workflow:task_start' && event.task_id) {
      store.patchTaskStatus(event.workspaceId, event.task_id, 'in_progress')
    } else if (event.type === 'workflow:task_complete' && event.task_id) {
      store.patchTaskStatus(event.workspaceId, event.task_id, 'completed')
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

  // Debounced full refresh for all workspace-related events (tasks created, etc.)
  if (event.workspaceId && event.workspaceId === activeWsId) {
    if (refreshDebounce) clearTimeout(refreshDebounce)
    refreshDebounce = setTimeout(() => {
      useWorkspaceStore.getState().refreshActiveWorkspace()
    }, 500)
  }
}
