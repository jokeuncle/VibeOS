import type { StoreApi } from 'zustand'
import type {
  Message,
  ConversationContext,
  UnifiedEvent,
} from '../../../types'
import { ExecutionSession } from '../../../lib/executionSession'
import {
  parseTimelineStep,
} from '../../../lib/sseEventParsers'
import { friendlyError } from '../helpers'
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
 * Run a workflow action via the unified conversation endpoint.
 * The ConversationEngine uses PM tools (run_phase, run_task, etc.) internally.
 */
function runViaConversation(
  set: SetState,
  get: GetState,
  message: string,
) {
  const wsId = get().activeWorkspaceId
  if (!wsId) return
  if (get().workflowRunning) return

  set({ workflowRunning: true, workflowEvents: [] })
  let content = ''

  const session = new ExecutionSession()
    .on('session', () => {})
    .on('timeline', (_action, data) => {
      const step = parseTimelineStep(data)
      const evt: UnifiedEvent = {
        category: 'timeline', action: step.status, data, sid: '',
      }
      set((s) => ({ workflowEvents: [...s.workflowEvents, evt] }))
    })
    .on('content', (action, data) => {
      if (action === 'delta' && data.delta) {
        content += data.delta
      }
    })

  ;(async () => {
    try {
      await session.run('/api/conversation/stream', {
        workspace_id: wsId,
        message,
      })
      if (content.trim()) {
        set((s) => ({
          messages: [...s.messages, makeSystemMsg(content.trim(), wsId)],
        }))
      }
    } catch (err: any) {
      const errMsg = friendlyError(err.message)
      set((s) => ({
        messages: [...s.messages, makeSystemMsg(`❌ ${errMsg}`, wsId)],
      }))
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
      runViaConversation(set, get, `Run task ${taskId}`)
    },

    runPhase: (phaseType: string, userMessage?: string) => {
      const msg = userMessage
        ? `Run the ${phaseType} phase: ${userMessage}`
        : `Run the ${phaseType} phase`
      runViaConversation(set, get, msg)
    },

    runProject: (userMessage?: string) => {
      const msg = userMessage
        ? `Run the full project: ${userMessage}`
        : 'Run the full project from the beginning'
      runViaConversation(set, get, msg)
    },

    runRequirement: (reqId: string, phaseType?: string, userMessage?: string) => {
      let msg = `Run requirement ${reqId}`
      if (phaseType) msg += ` for phase ${phaseType}`
      if (userMessage) msg += `: ${userMessage}`
      runViaConversation(set, get, msg)
    },
  } satisfies Pick<
    WorkspaceState,
    | 'workflowRunning' | 'workflowEvents'
    | 'runTask' | 'runPhase' | 'runProject' | 'runRequirement'
  >
}
