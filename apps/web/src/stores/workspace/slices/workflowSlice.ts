import type { StoreApi } from 'zustand'
import type {
  Message,
  AgentExecution,
  PhaseStatus,
  ConversationContext,
  UnifiedEvent,
} from '../../../types'
import { ExecutionSession } from '../../../lib/executionSession'
import { workflowEventToMessage } from '../helpers'
import type { WorkspaceState } from '../types'

type SetState = StoreApi<WorkspaceState>['setState']
type GetState = StoreApi<WorkspaceState>['getState']

function makeSystemMsg(content: string, wsId: string): Message {
  return {
    id: crypto.randomUUID(),
    role: 'system',
    content,
    timestamp: new Date().toISOString(),
    contextType: 'workspace' as ConversationContext,
    workspaceId: wsId,
  }
}

/**
 * Shared runner: starts an ExecutionSession against a workflow endpoint,
 * manages workflowRunning state, creates AgentExecution records, updates
 * task/phase statuses, and emits chat messages.
 */
function runWorkflowSession(
  set: SetState,
  get: GetState,
  url: string,
  body: object,
  sessionType: string,
) {
  const wsId = get().activeWorkspaceId
  if (!wsId) return
  if (get().workflowRunning) return

  set({ workflowRunning: true, workflowEvents: [] })
  let sid = ''
  let hasError = false

  const pushEvent = (evt: UnifiedEvent) => {
    set((s) => ({ workflowEvents: [...s.workflowEvents, evt] }))
  }

  const session = new ExecutionSession()
    .on('session', (action, data, sessSid) => {
      sid = sessSid
      if (action === 'start') {
        const exec: AgentExecution = {
          id: sid,
          workspaceId: wsId,
          intentType: sessionType,
          intentSummary: sessionType,
          triggeredBy: 'workflow',
          userMessage: '',
          status: 'running',
          agentType: 'pm',
          steps: [],
          taskIds: [],
          resultType: 'unknown',
          startedAt: new Date().toISOString(),
        }
        get().upsertExecution(exec)
      } else if (action === 'complete') {
        const status = data.status === 'success' ? 'success' : 'failed'
        get().patchExecutionStatus(sid, status as any)
      } else if (action === 'error') {
        hasError = true
        get().patchExecutionStatus(sid, 'failed', { errorMessage: data.error })
      }
    })
    .on('task', (action, data, sessSid) => {
      sid = sessSid
      pushEvent({ category: 'task', action, data, sid })
      if (action === 'start' && data.task_id) {
        get().patchTaskStatus(wsId, data.task_id, 'in_progress' as PhaseStatus)
        const msg = workflowEventToMessage(`task:start`, data)
        if (msg) set((s) => ({ messages: [...s.messages, makeSystemMsg(msg, wsId)] }))
      } else if (action === 'complete' && data.task_id) {
        get().patchTaskStatus(wsId, data.task_id, 'completed' as PhaseStatus)
        const msg = workflowEventToMessage(`task:complete`, data)
        if (msg) set((s) => ({ messages: [...s.messages, makeSystemMsg(msg, wsId)] }))
      } else if (action === 'error' && data.task_id) {
        get().patchTaskStatus(wsId, data.task_id, 'pending' as PhaseStatus)
        hasError = true
        const msg = workflowEventToMessage(`task:error`, data)
        if (msg) set((s) => ({ messages: [...s.messages, makeSystemMsg(msg, wsId)] }))
      }
    })
    .on('phase', (action, data, sessSid) => {
      sid = sessSid
      pushEvent({ category: 'phase', action, data, sid })
      if (action === 'start' && data.phase) {
        const phaseId = get().workspaces.find((w) => w.id === wsId)?.phases?.find((p) => p.type === data.phase)?.id
        if (phaseId) get().updatePhaseStatus(wsId, phaseId, 'in_progress' as PhaseStatus)
        const msg = workflowEventToMessage(`phase:start`, data)
        if (msg) set((s) => ({ messages: [...s.messages, makeSystemMsg(msg, wsId)] }))
      } else if (action === 'complete' && data.phase) {
        const phaseId = get().workspaces.find((w) => w.id === wsId)?.phases?.find((p) => p.type === data.phase)?.id
        if (phaseId && (data.tasks_failed === 0 || data.tasks_failed === undefined)) {
          get().updatePhaseStatus(wsId, phaseId, 'completed' as PhaseStatus)
        }
        const msg = workflowEventToMessage(`phase:complete`, data)
        if (msg) set((s) => ({ messages: [...s.messages, makeSystemMsg(msg, wsId)] }))
      } else if (action === 'skip') {
        const msg = workflowEventToMessage(`phase:skip`, data)
        if (msg) set((s) => ({ messages: [...s.messages, makeSystemMsg(msg, wsId)] }))
      }
    })
    .on('project', (action, data, sessSid) => {
      sid = sessSid
      pushEvent({ category: 'project', action, data, sid })
      const msg = workflowEventToMessage(`project:${action}`, data)
      if (msg) set((s) => ({ messages: [...s.messages, makeSystemMsg(msg, wsId)] }))
    })
    .on('content', (action, data) => {
      if (action === 'block' && data.blockType === 'warning') {
        const msg = data.message || 'Warning'
        set((s) => ({ messages: [...s.messages, makeSystemMsg(`⚠️ ${msg}`, wsId)] }))
      }
    })

  ;(async () => {
    try {
      await session.run(url, body)
    } catch (err: any) {
      hasError = true
      const errMsg = err.message || 'Workflow error'
      set((s) => ({ messages: [...s.messages, makeSystemMsg(`❌ ${errMsg}`, wsId)] }))
      if (sid) get().patchExecutionStatus(sid, 'failed', { errorMessage: errMsg })
    } finally {
      set({ workflowRunning: false })
      get().refreshActiveWorkspace()
    }
  })()
}

export function buildWorkflowSlice(set: SetState, get: GetState) {
  return {
    workflowRunning: false,
    workflowEvents: [] as UnifiedEvent[],

    runTask: (taskId: string) => {
      const wsId = get().activeWorkspaceId
      if (!wsId) return
      runWorkflowSession(set, get, '/api/workflow/run-task', {
        workspace_id: wsId,
        task_id: taskId,
      }, 'workflow_task')
    },

    runPhase: (phaseType: string, userMessage?: string) => {
      const wsId = get().activeWorkspaceId
      if (!wsId) return
      runWorkflowSession(set, get, '/api/workflow/run-phase', {
        workspace_id: wsId,
        phase_type: phaseType,
        user_message: userMessage || '',
      }, `workflow_phase:${phaseType}`)
    },

    runProject: (userMessage?: string) => {
      const wsId = get().activeWorkspaceId
      if (!wsId) return
      runWorkflowSession(set, get, '/api/workflow/run-project', {
        workspace_id: wsId,
        user_message: userMessage || '',
      }, 'workflow_project')
    },

    runRequirement: (reqId: string, phaseType?: string, userMessage?: string) => {
      const wsId = get().activeWorkspaceId
      if (!wsId) return
      runWorkflowSession(set, get, '/api/workflow/run-requirement', {
        workspace_id: wsId,
        requirement_id: reqId,
        phase_type: phaseType || '',
        user_message: userMessage || '',
      }, `workflow_requirement:${reqId}`)
    },
  } satisfies Pick<
    WorkspaceState,
    | 'workflowRunning' | 'workflowEvents'
    | 'runTask' | 'runPhase' | 'runProject' | 'runRequirement'
  >
}
