import { useWorkspaceStore } from '../stores/workspace'

let socket: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null

export function connectWebSocket() {
  if (socket?.readyState === WebSocket.OPEN) return

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
    console.log('[WS] disconnected, reconnecting in 3s')
    socket = null
    reconnectTimer = setTimeout(connectWebSocket, 3000)
  }

  socket.onerror = () => {
    socket?.close()
  }
}

export function disconnectWebSocket() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  socket?.close()
  socket = null
}

function handleWSEvent(event: { type: string; workspaceId?: string; payload?: any }) {
  const store = useWorkspaceStore.getState()
  const activeWsId = store.activeWorkspaceId

  if (event.workspaceId && event.workspaceId === activeWsId) {
    store.refreshActiveWorkspace()
  }
}
