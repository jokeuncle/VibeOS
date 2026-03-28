import { useWorkspaceStore } from '../stores/workspace'

let socket: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let intentionalClose = false

export function connectWebSocket() {
  if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return
  intentionalClose = false

  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const url = `${protocol}://${window.location.host}/ws`

  socket = new WebSocket(url)

  socket.onopen = () => {
    console.log('[WS] connected')
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
    reconnectTimer = setTimeout(connectWebSocket, 3000)
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

  if (event.workspaceId && event.workspaceId === activeWsId) {
    store.refreshActiveWorkspace()
  }
}
