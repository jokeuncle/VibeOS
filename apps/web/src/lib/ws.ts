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

let activeConnectionTargetId: string | null = null
let consecutiveReconnectFailures = 0
let gaveUpLogged = false

/**
 * Active SSE session IDs — events with a sid present in this set are
 * already being consumed by an ExecutionSession and should not be
 * double-applied from the WS mirror.
 */
const activeSids = new Set<string>()

export function registerActiveSid(sid: string) { activeSids.add(sid) }
export function unregisterActiveSid(sid: string) { activeSids.delete(sid) }

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
  const eventType: string = event.type || ''
  const sid: string | undefined = event.sid

  // Dedup: if the event carries a sid that is currently being consumed
  // via an SSE ExecutionSession, skip it to avoid double-applying.
  if (sid && activeSids.has(sid)) return

  // Chat messages
  if (eventType === 'chat:message' && event.workspaceId === activeWsId && event.payload) {
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
        contextType: p.contextType || 'workspace',
      })
    }
  }

  // Agent status
  if (eventType === 'agent:status' && event.workspaceId) {
    store.updateAgentStatus(event.workspaceId, event.agentType, event.status, event.detail)
  }

  // Agent logs
  if (eventType === 'agent:log' && event.workspaceId === activeWsId) {
    const p = event.payload || event
    store.appendAgentLog({
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      agent: p.agent || p.agentType || 'unknown',
      phase: p.phase || '',
      level: p.level || 'info',
      message: p.message || p.detail || '',
      taskId: p.task_id || p.taskId,
    })
  }

  // Unified task/phase/project status patching
  if (event.workspaceId === activeWsId) {
    if (eventType === 'task:start' && event.task_id) {
      store.patchTaskStatus(event.workspaceId, event.task_id, 'in_progress')
    } else if (eventType === 'task:complete' && event.task_id) {
      store.patchTaskStatus(event.workspaceId, event.task_id, 'completed')
    } else if (eventType === 'task:error' && event.task_id) {
      store.patchTaskStatus(event.workspaceId, event.task_id, 'pending')
    }

    // Phase status patching — resolve phase UUID from type name
    const payload = event.payload || event
    const phaseType = payload.phase
    if (phaseType && (eventType === 'phase:start' || eventType === 'phase:complete')) {
      const ws = store.workspaces.find(w => w.id === activeWsId)
      const phase = ws?.phases.find(p => p.type === phaseType)
      if (phase) {
        const newStatus = eventType === 'phase:start'
          ? 'in_progress' as const
          : (payload.tasks_failed > 0 ? 'in_progress' as const : 'completed' as const)
        store.updatePhaseStatus(event.workspaceId, phase.id, newStatus)
      }
    }

    // Project start/complete — set workflow running state
    if (eventType === 'project:start') {
      useWorkspaceStore.setState({ workflowRunning: true })
    } else if (eventType === 'project:complete' || eventType === 'project:error') {
      useWorkspaceStore.setState({ workflowRunning: false })
    }

    // Phase awaiting approval — update requirement status in store
    if (eventType === 'phase:awaiting_approval') {
      const p = payload
      if (p.requirement_id && activeWsId) {
        store.patchRequirementStatus?.(activeWsId, p.requirement_id, 'awaiting_approval')
      }
    }

    const workflowEventTypes = [
      'phase:start', 'phase:complete', 'phase:skip', 'phase:awaiting_approval',
      'task:start', 'task:complete', 'task:error',
      'project:start', 'project:complete', 'project:error',
    ]
    if (workflowEventTypes.includes(eventType)) {
      const [category, action] = eventType.split(':')
      store.appendWorkflowEvent({ category: category as any, action, data: event, sid: sid || '' })

      if (store.nlpLoading) {
        store.injectWorkflowStepToChat({ category, action, data: event as Record<string, unknown> })
      }

      // Feed graph overlay — map phase/node events into node IDs
      const nodeId = payload.phase || payload.node || ''
      if (nodeId) {
        import('../components/ControlCenter/useGraphStore').then(({ useGraphStore }) => {
          useGraphStore.getState().injectWorkflowEvent(category, action, { ...event, node: nodeId })
        })
      }
    }
  }

  // Notifications
  const addNotification = useUIStore.getState().addNotification
  const wsId = event.workspaceId || undefined

  if (eventType === 'phase:complete' && event.phase) {
    addNotification({
      title: `${event.phase} phase completed`,
      description: event.tasks_executed ? `${event.tasks_executed} tasks executed` : '',
      time: new Date().toISOString(),
      workspaceId: wsId,
    })
  } else if (eventType === 'project:complete') {
    addNotification({
      title: 'Project workflow completed',
      description: event.success ? 'All phases finished successfully' : 'Completed with issues',
      time: new Date().toISOString(),
      workspaceId: wsId,
    })
  } else if (eventType === 'project:start') {
    addNotification({
      title: 'Project workflow started',
      description: event.phases?.join(' → ') || '',
      time: new Date().toISOString(),
      workspaceId: wsId,
    })
  } else if (eventType === 'task:error' && event.task_title) {
    addNotification({
      title: `Task failed: ${event.task_title}`,
      description: event.error || '',
      time: new Date().toISOString(),
      workspaceId: wsId,
    })
  } else if (eventType === 'agent:status' && event.status === 'error' && event.detail) {
    addNotification({
      title: `Agent error: ${event.agentType || 'unknown'}`,
      description: event.detail,
      time: new Date().toISOString(),
      workspaceId: wsId,
    })
  }

  // Governance approval requests
  if (eventType === 'approval:required' && event.payload) {
    const p = event.payload
    addNotification({
      title: `Approval required: ${p.agent_type || 'agent'}`,
      description: p.description || 'A task requires human approval before proceeding',
      time: new Date().toISOString(),
      workspaceId: wsId,
      approvalKey: p.approval_key,
    })
  }

  // Phase-level approval request (stop-and-go pipeline)
  if (eventType === 'phase:awaiting_approval') {
    const p = event.payload || event
    addNotification({
      title: `Phase requires approval: ${p.phase || 'unknown'}`,
      description: p.requirement_title
        ? `Requirement "${p.requirement_title}" is waiting for approval to proceed`
        : 'Pipeline paused — approve to continue',
      time: new Date().toISOString(),
      workspaceId: wsId,
      approvalKey: p.approval_key,
    })
  }

  // Graph node-level approval request
  if (eventType === 'graph:node_awaiting_approval') {
    const p = event.payload || event
    addNotification({
      title: `Node requires approval: ${p.node || 'unknown'}`,
      description: p.summary ? `Review: ${p.summary.slice(0, 120)}` : 'A graph node is awaiting human review',
      time: new Date().toISOString(),
      workspaceId: wsId,
      approvalKey: p.thread_id ? `graph:${p.thread_id}:${p.node}` : undefined,
    })
  }

  // Quality gate events
  if (eventType === 'quality_gate:check' && event.payload) {
    addNotification({
      title: `Quality gate: ${event.payload.phase || 'unknown'}`,
      description: `Checking: ${event.payload.gate || 'default'}`,
      time: new Date().toISOString(),
      workspaceId: wsId,
    })
  }

  // Trust degraded — agent trust score dropped below threshold
  if (eventType === 'trust:degraded' && event.payload) {
    const p = event.payload
    const score = typeof p.score === 'number' ? p.score.toFixed(1) : '?'
    addNotification({
      title: `Trust degraded: ${p.agent_type || 'agent'}`,
      description: `Score ${score} < threshold ${p.threshold}. ${p.suggestion || ''}`,
      time: new Date().toISOString(),
      workspaceId: wsId,
    })
    useUIStore.getState().addToast({
      type: 'error',
      message: `${p.agent_type} trust score dropped to ${score} (model: ${p.model || 'unknown'})`,
    })
  }

  // Debounced full refresh for structural events
  if (event.workspaceId && event.workspaceId === activeWsId && eventType !== 'agent:status') {
    if (refreshDebounce) clearTimeout(refreshDebounce)
    refreshDebounce = setTimeout(() => {
      useWorkspaceStore.getState().refreshActiveWorkspace()
    }, 500)
  }
}
