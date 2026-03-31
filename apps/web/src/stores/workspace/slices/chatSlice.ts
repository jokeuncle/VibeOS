import type { StoreApi } from 'zustand'
import type { AgentType, AgentExecution, Message, RichBlock, ExecutionStep, ConversationContext } from '../../../types'
import {
  workspaceApi,
  globalMessageApi,
  agentApi,
  mapNLPResultToMessage,
  mapAgentChatToMessage,
} from '../../../lib/api'
import { ExecutionSession } from '../../../lib/executionSession'
import {
  parseContentBlock,
  parseIntentBlock,
  parseTimelineStep,
  parseAmbiguousBlock,
} from '../../../lib/sseEventParsers'
import {
  friendlyError,
  buildNlpPhaseContext,
  safeParseRichBlocks,
  mergeMessagesById,
} from '../helpers'
import type { WorkspaceState, MessageScope } from '../types'
import { workspaceMessagesFetchInflight } from '../inflight'

type SetState = StoreApi<WorkspaceState>['setState']
type GetState = StoreApi<WorkspaceState>['getState']

function makeMsg(
  partial: Partial<Message> & { id: string; role: Message['role']; content: string; contextType: ConversationContext },
): Message {
  return { timestamp: new Date().toISOString(), ...partial }
}

function intentToResultType(intent: string): string {
  const map: Record<string, string> = {
    trigger_build: 'pipeline', view_build_log: 'pipeline',
    deploy: 'deployment', rollback: 'deployment',
    generate_code: 'code_gen', ui_design: 'design_doc',
    design_system: 'architecture', architecture_design: 'architecture',
    run_tests: 'test_report', analyze_requirements: 'requirement_analysis',
  }
  return map[intent] || 'general'
}

export function buildChatSlice(set: SetState, get: GetState) {
  /**
   * Shared NLP stream handler using unified ExecutionSession.
   * Works for both workspace and home contexts.
   */
  function runNlpSession(
    wsId: string,
    input: string,
    msgId: string,
    isHome: boolean,
    sessionId?: string,
  ) {
    let content = ''
    let agentType: AgentType = 'pm'
    const richBlocks: RichBlock[] = []
    const timelineSteps: ExecutionStep[] = []
    let execCreated = false
    let execHadError = false
    let sid = ''
    const persist = !isHome && !wsId.startsWith('ws-temp-')

    const updateMsg = () => {
      const msg: Partial<Message> = { content, agentType, richBlocks: richBlocks.length > 0 ? [...richBlocks] : undefined }
      if (isHome) {
        set((s) => ({ homeMessages: s.homeMessages.map((m) => m.id === msgId ? { ...m, ...msg } : m) }))
      } else {
        set((s) => ({ messages: s.messages.map((m) => m.id === msgId ? { ...m, ...msg } : m) }))
      }
    }

    const upsertTimeline = () => {
      const idx = richBlocks.findIndex((b) => b.type === 'execution_timeline')
      const block: RichBlock = { type: 'execution_timeline', steps: [...timelineSteps] }
      if (idx !== -1) richBlocks[idx] = block
      else richBlocks.unshift(block)
    }

    const nlpCtx = isHome ? { home: true } : buildNlpPhaseContext(get)
    const session = new ExecutionSession()
      .on('session', (action, data, sessSid) => {
        sid = sessSid
      })
      .on('timeline', (_action, data, sessSid) => {
        sid = sessSid
        const step = parseTimelineStep(data)
        const existing = timelineSteps.find((s) => s.id === step.id)
        if (existing) {
          existing.status = step.status
          if (step.detail) existing.detail = step.detail
        } else {
          timelineSteps.push(step)
        }
        upsertTimeline()
        updateMsg()
        if (execCreated) {
          get().patchExecutionStep(sid, { ...step })
        }
      })
      .on('intent', (action, data, sessSid) => {
        sid = sessSid
        if (action === 'parsed' && data.target_agent) {
          const { block: intentBlock, agentType: at } = parseIntentBlock(data)
          agentType = at
          const iidx = richBlocks.findIndex((b) => b.type === 'intent_feedback')
          if (iidx !== -1) richBlocks[iidx] = intentBlock
          else richBlocks.push(intentBlock)
          updateMsg()

          if (!isHome) {
            const intentType = data.intent || 'general_chat'
            if (intentType !== 'general_chat') {
              const reqId = typeof nlpCtx?.requirement_id === 'string' ? nlpCtx.requirement_id : undefined
              const exec: AgentExecution = {
                id: sessSid, workspaceId: wsId,
                requirementId: reqId || undefined, taskIds: [],
                intentType, intentSummary: data.summary || input.slice(0, 60),
                triggeredBy: 'nlp', userMessage: input, status: 'running',
                agentType: at, steps: [...timelineSteps],
                resultType: intentToResultType(intentType),
                startedAt: new Date().toISOString(),
              }
              get().upsertExecution(exec)
              get().persistExecution(exec)
              execCreated = true
            }
          }
        } else if (action === 'ambiguous') {
          richBlocks.push(parseAmbiguousBlock(data))
          updateMsg()
        }
      })
      .on('content', (action, data) => {
        if (action === 'delta' && data.delta) {
          content += data.delta
        } else if (action === 'block') {
          const parsed = parseContentBlock(data)
          if (parsed) richBlocks.push(parsed)
        } else if (action === 'payload') {
          const payload = data.payload || data
          if (payload.summary) content = payload.summary
          if (payload.artifacts) {
            for (const art of payload.artifacts) {
              richBlocks.push({ type: 'code', title: art.title, language: art.type === 'diagram' ? 'text' : art.type === 'adr' ? 'markdown' : art.type, code: art.content })
            }
          }
          if (payload.created_tasks) {
            for (const t of payload.created_tasks) {
              richBlocks.push({ type: 'task_card', taskTitle: t.title || t.data?.title, taskStatus: 'pending' })
            }
          }
        }
        updateMsg()
      })
      .on('graph', (_action, data) => {
        // Graph events within NLP are informational
        updateMsg()
      })

    ;(async () => {
      try {
        await session.run(
          '/api/nlp/stream',
          { workspace_id: wsId, message: input, ...(nlpCtx && Object.keys(nlpCtx).length > 0 ? { context: nlpCtx } : {}) },
        )
      } catch (err: any) {
        execHadError = true
        const errMsg = friendlyError(err.message)
        if (!content) {
          // Only error_card — avoid duplicating the same text in msg.content + card body
          richBlocks.push({
            type: 'error_card',
            errorSeverity: 'system_error',
            errorMessage: errMsg,
            errorActions: [{ id: 'retry', label: '重试', variant: 'primary' }],
          })
          updateMsg()
        }
        if (execCreated) {
          get().patchExecutionStatus(sid, 'failed', { errorMessage: errMsg })
          get().persistExecutionUpdate(sid, { status: 'failed', errorMessage: errMsg })
        }
      } finally {
        if (isHome) {
          set({ homeNlpLoading: false })
          const hasAgentTurn = content.trim().length > 0 || richBlocks.length > 0
          if (hasAgentTurn) {
            globalMessageApi.save({
              role: 'agent',
              content: content.trim(),
              agentType,
              richBlocks: richBlocks.length > 0 ? JSON.stringify(richBlocks) : undefined,
            }).catch(() => {})
          }
        } else {
          set({ nlpLoading: false })
          if (execCreated && !execHadError) {
            get().patchExecutionStatus(sid, 'success')
            get().persistExecutionUpdate(sid, { status: 'success' })
          }
          if (persist && (content.trim() || richBlocks.length > 0)) {
            workspaceApi.saveMessage(wsId, {
              role: 'agent', content: content.trim(), agentType,
              richBlocks: richBlocks.length > 0 ? JSON.stringify(richBlocks) : undefined,
              contextType: 'workspace',
              executionId: execCreated ? sid : undefined,
            }).catch(() => {})
          }
          get().refreshActiveWorkspace()
        }
      }
    })()
  }

  return {
    messages: [] as Message[],
    messagesCursor: null as string | null,
    messagesHasMore: false,
    nlpLoading: false,
    chatLoading: false,
    agentChatMessages: {} as Record<string, Message[]>,
    homeMessages: [] as Message[],
    homeNlpLoading: false,
    homeMessagesCursor: null as string | null,
    homeMessagesHasMore: false,

    addMessage: (message: Message) => {
      const ctx = message.contextType || 'workspace'
      if (ctx === 'home') {
        set((s) => ({ homeMessages: [...s.homeMessages, message] }))
        globalMessageApi.save({
          role: message.role, content: message.content || '',
          agentType: message.agentType,
          richBlocks: message.richBlocks ? JSON.stringify(message.richBlocks) : undefined,
        }).catch((err) => console.warn('Failed to persist home message:', err))
      } else {
        set((s) => ({ messages: [...s.messages, message] }))
        const wsId = get().activeWorkspaceId
        if (wsId && !wsId.startsWith('ws-temp-')) {
          workspaceApi.saveMessage(wsId, {
            role: message.role, content: message.content || '',
            agentType: message.agentType,
            richBlocks: message.richBlocks ? JSON.stringify(message.richBlocks) : undefined,
            contextType: ctx, requirementId: message.requirementId,
            executionId: message.executionId,
          }).catch((err) => console.warn('Failed to persist message:', err))
        }
      }
    },

    sendNLPMessage: (input: string) => {
      const wsId = get().activeWorkspaceId
      if (!wsId) return
      const sessionId = `s-${Math.floor(Date.now() / 300000)}`
      const ts = new Date().toISOString()
      const userMsg = makeMsg({ id: crypto.randomUUID(), role: 'user', content: input, timestamp: ts, sessionId, contextType: 'workspace', workspaceId: wsId })
      set((s) => ({ nlpLoading: true, messages: [...s.messages, userMsg] }))
      if (!wsId.startsWith('ws-temp-')) {
        workspaceApi.saveMessage(wsId, { role: 'user', content: input, contextType: 'workspace' }).catch(() => {})
      }
      const nlpCtx = buildNlpPhaseContext(get)
      agentApi.nlp(wsId, input, nlpCtx)
        .then((resp) => {
          const agentMsg = mapNLPResultToMessage(resp, sessionId)
          set((s) => ({ nlpLoading: false, messages: [...s.messages, agentMsg] }))
          if (!wsId.startsWith('ws-temp-')) {
            workspaceApi.saveMessage(wsId, { role: agentMsg.role, content: agentMsg.content || '', agentType: agentMsg.agentType, richBlocks: agentMsg.richBlocks ? JSON.stringify(agentMsg.richBlocks) : undefined, contextType: 'workspace' }).catch(() => {})
          }
          get().refreshActiveWorkspace()
        })
        .catch((err) => {
          const errContent = friendlyError(err.message)
          const errMsg = makeMsg({ id: crypto.randomUUID(), role: 'agent', content: errContent, agentType: 'pm' as AgentType, sessionId, contextType: 'workspace', workspaceId: wsId })
          set((s) => ({ nlpLoading: false, messages: [...s.messages, errMsg] }))
          if (!wsId.startsWith('ws-temp-')) {
            workspaceApi.saveMessage(wsId, { role: 'agent', content: errContent, agentType: 'pm', contextType: 'workspace' }).catch(() => {})
          }
        })
    },

    sendAgentChatMessage: (agentType: string, input: string) => {
      const wsId = get().activeWorkspaceId
      if (!wsId) return
      const key = `${wsId}:${agentType}`
      const userMsg = makeMsg({ id: crypto.randomUUID(), role: 'user', content: input, contextType: 'agent_dm', workspaceId: wsId })
      set((s) => ({ chatLoading: true, agentChatMessages: { ...s.agentChatMessages, [key]: [...(s.agentChatMessages[key] || []), userMsg] } }))
      agentApi.chat(agentType, wsId, input)
        .then((resp) => {
          const agentMsg = mapAgentChatToMessage(resp, agentType)
          set((s) => ({ chatLoading: false, agentChatMessages: { ...s.agentChatMessages, [key]: [...(s.agentChatMessages[key] || []), agentMsg] } }))
          get().refreshActiveWorkspace()
        })
        .catch((err) => {
          const errMsg = makeMsg({ id: crypto.randomUUID(), role: 'agent', content: friendlyError(err.message), agentType: agentType as AgentType, contextType: 'agent_dm', workspaceId: wsId })
          set((s) => ({ chatLoading: false, agentChatMessages: { ...s.agentChatMessages, [key]: [...(s.agentChatMessages[key] || []), errMsg] } }))
        })
    },

    sendNLPMessageStream: (input: string) => {
      const wsId = get().activeWorkspaceId
      if (!wsId) return
      const sessionId = `s-${Math.floor(Date.now() / 300000)}`
      const ts = new Date().toISOString()
      const msgId = crypto.randomUUID()
      const persist = !wsId.startsWith('ws-temp-')

      set((s) => ({
        nlpLoading: true,
        messages: [
          ...s.messages,
          makeMsg({ id: crypto.randomUUID(), role: 'user', content: input, timestamp: ts, sessionId, contextType: 'workspace', workspaceId: wsId }),
          makeMsg({ id: msgId, role: 'agent', content: '', agentType: 'pm', sessionId, contextType: 'workspace', workspaceId: wsId }),
        ],
      }))
      if (persist) {
        workspaceApi.saveMessage(wsId, { role: 'user', content: input, contextType: 'workspace' }).catch(() => {})
      }
      runNlpSession(wsId, input, msgId, false, sessionId)
    },

    clearHomeMessages: () => {
      set({ homeMessages: [], homeNlpLoading: false })
    },

    clearWorkspaceConversation: () => {
      set({ messages: [], nlpLoading: false })
    },

    sendHomeNLPStream: (input: string) => {
      const ts = new Date().toISOString()
      const msgId = crypto.randomUUID()
      const userMsg = makeMsg({ id: crypto.randomUUID(), role: 'user', content: input, timestamp: ts, contextType: 'home' })
      set((s) => ({
        homeNlpLoading: true,
        homeMessages: [
          ...s.homeMessages,
          userMsg,
          makeMsg({ id: msgId, role: 'agent', content: '', agentType: 'pm', contextType: 'home' }),
        ],
      }))
      globalMessageApi.save({ role: 'user', content: input }).catch(() => {})
      runNlpSession('__home__', input, msgId, true)
    },

    sendAgentChatMessageStream: (agentType: string, input: string) => {
      const wsId = get().activeWorkspaceId
      if (!wsId) return
      const key = `${wsId}:${agentType}`
      const ts = new Date().toISOString()
      const userMsg = makeMsg({ id: crypto.randomUUID(), role: 'user', content: input, timestamp: ts, contextType: 'agent_dm', workspaceId: wsId })
      const replyId = crypto.randomUUID()

      set((s) => ({
        chatLoading: true,
        agentChatMessages: {
          ...s.agentChatMessages,
          [key]: [
            ...(s.agentChatMessages[key] || []),
            userMsg,
            makeMsg({ id: replyId, role: 'agent', content: '', agentType: agentType as AgentType, timestamp: ts, contextType: 'agent_dm', workspaceId: wsId }),
          ],
        },
      }))

      let content = ''
      const richBlocks: RichBlock[] = []

      const session = new ExecutionSession()
        .on('content', (action, data) => {
          if (action === 'delta' && data.delta) content += data.delta
          else if (action === 'payload') {
            if (data.summary) content = data.summary
            if (data.content) content = data.content
            if (data.rich_blocks) {
              for (const rb of data.rich_blocks) {
                if (rb.type === 'code') richBlocks.push({ type: 'code', title: rb.title, language: rb.language, code: rb.content || rb.code })
                else if (rb.type === 'task_card') richBlocks.push({ type: 'task_card', taskTitle: rb.content || rb.taskTitle, taskStatus: 'pending' })
              }
            }
          }
          if (content) {
            set((s) => ({
              agentChatMessages: {
                ...s.agentChatMessages,
                [key]: (s.agentChatMessages[key] || []).map((m) =>
                  m.id === replyId ? { ...m, content, richBlocks: richBlocks.length > 0 ? [...richBlocks] : undefined } : m,
                ),
              },
            }))
          }
        })
        .on('session', (action, data) => {
          if (action === 'error' && data.error && !content) {
            content = friendlyError(data.error)
            set((s) => ({
              agentChatMessages: { ...s.agentChatMessages, [key]: (s.agentChatMessages[key] || []).map((m) => m.id === replyId ? { ...m, content } : m) },
            }))
          }
        })

      ;(async () => {
        try {
          await session.run(`/api/chat/${agentType}/stream`, { workspace_id: wsId, message: input })
        } catch (err: any) {
          if (!content) {
            set((s) => ({
              agentChatMessages: { ...s.agentChatMessages, [key]: (s.agentChatMessages[key] || []).map((m) => m.id === replyId ? { ...m, content: friendlyError(err.message) } : m) },
            }))
          }
        } finally {
          set({ chatLoading: false })
          get().refreshActiveWorkspace()
        }
      })()
    },

    fetchMessages: async (scope: MessageScope) => {
      if (scope.contextType === 'home') {
        try {
          const resp = await globalMessageApi.list(undefined, 50).catch(() => ({ data: [] as any[], hasMore: false, cursor: undefined as string | undefined }))
          const restored: Message[] = (resp.data || []).reverse().map((m: any) => ({
            id: m.id, role: m.role, content: m.content, agentType: m.agentType,
            timestamp: m.createdAt, richBlocks: safeParseRichBlocks(m.richBlocks),
            sessionId: m.sessionId, contextType: 'home' as ConversationContext,
            workspaceId: m.workspaceId, requirementId: m.requirementId, executionId: m.executionId,
          }))
          set((s) => ({ homeMessages: mergeMessagesById(restored, s.homeMessages), homeMessagesCursor: resp.cursor || null, homeMessagesHasMore: resp.hasMore || false }))
        } catch (err) {
          console.error('Failed to fetch home messages:', err)
        }
        return
      }
      const wsId = scope.workspaceId
      if (!wsId) return
      return get().fetchWorkspaceMessages(wsId)
    },

    fetchWorkspaceMessages: async (workspaceId?: string) => {
      const id = workspaceId ?? get().activeWorkspaceId
      if (!id || id.startsWith('ws-temp-')) return
      const inflight = workspaceMessagesFetchInflight.get(id)
      if (inflight) return inflight
      const run = (async () => {
        try {
          const msgResp = await workspaceApi.listMessages(id, undefined, 50).catch(() => ({ data: [] as any[], hasMore: false, cursor: undefined as string | undefined }))
          if (get().activeWorkspaceId !== id) return
          const restored: Message[] = (msgResp.data || []).reverse().map((m: any) => ({
            id: m.id, role: m.role, content: m.content, agentType: m.agentType,
            timestamp: m.createdAt, richBlocks: safeParseRichBlocks(m.richBlocks),
            sessionId: m.sessionId, contextType: (m.contextType || 'workspace') as ConversationContext,
            workspaceId: m.workspaceId, requirementId: m.requirementId, executionId: m.executionId,
          }))
          set((s) => {
            if (s.activeWorkspaceId !== id) return {}
            return { messages: mergeMessagesById(restored, s.messages), messagesCursor: msgResp.cursor || null, messagesHasMore: msgResp.hasMore || false }
          })
        } catch (err) {
          console.error('Failed to fetch workspace messages:', err)
        } finally {
          workspaceMessagesFetchInflight.delete(id)
        }
      })()
      workspaceMessagesFetchInflight.set(id, run)
      return run
    },

    loadOlderMessages: (scope?: MessageScope) => {
      if (scope?.contextType === 'home') {
        const cursor = get().homeMessagesCursor
        if (!cursor) return
        return globalMessageApi.list(cursor, 50).then((resp) => {
          const older: Message[] = (resp.data || []).reverse().map((m: any) => ({
            id: m.id, role: m.role, content: m.content, agentType: m.agentType,
            timestamp: m.createdAt, richBlocks: safeParseRichBlocks(m.richBlocks),
            sessionId: m.sessionId, contextType: 'home' as ConversationContext,
          }))
          set((s) => ({ homeMessages: [...older, ...s.homeMessages], homeMessagesCursor: resp.cursor || null, homeMessagesHasMore: resp.hasMore }))
        }).catch((err) => console.error('Failed to load older home messages:', err))
      }
      const wsId = get().activeWorkspaceId
      const cursor = get().messagesCursor
      if (!wsId || !cursor) return
      return workspaceApi.listMessages(wsId, cursor, 50).then((resp) => {
        if (get().activeWorkspaceId !== wsId) return
        const older: Message[] = (resp.data || []).reverse().map((m: any) => ({
          id: m.id, role: m.role, content: m.content, agentType: m.agentType,
          timestamp: m.createdAt, richBlocks: safeParseRichBlocks(m.richBlocks),
          sessionId: m.sessionId, contextType: (m.contextType || 'workspace') as ConversationContext,
          workspaceId: m.workspaceId, requirementId: m.requirementId, executionId: m.executionId,
        }))
        set((s) => {
          if (s.activeWorkspaceId !== wsId) return {}
          return { messages: [...older, ...s.messages], messagesCursor: resp.cursor || null, messagesHasMore: resp.hasMore }
        })
      }).catch((err) => console.error('Failed to load older messages:', err))
    },
  } satisfies Pick<
    WorkspaceState,
    | 'messages' | 'messagesCursor' | 'messagesHasMore'
    | 'nlpLoading' | 'chatLoading' | 'agentChatMessages'
    | 'homeMessages' | 'homeNlpLoading' | 'homeMessagesCursor' | 'homeMessagesHasMore'
    | 'addMessage' | 'sendNLPMessage' | 'sendAgentChatMessage'
    | 'sendNLPMessageStream' | 'sendAgentChatMessageStream'
    | 'sendHomeNLPStream' | 'clearHomeMessages' | 'clearWorkspaceConversation'
    | 'fetchMessages' | 'fetchWorkspaceMessages' | 'loadOlderMessages'
  >
}
