import type { StoreApi } from 'zustand'
import type { AgentType, Message, RichBlock } from '../../../types'
import {
  workspaceApi,
  agentApi,
  mapNLPResultToMessage,
  mapAgentChatToMessage,
  streamSSE,
} from '../../../lib/api'
import {
  friendlyError,
  buildNlpPhaseContext,
  safeParseRichBlocks,
  mergeMessagesById,
} from '../helpers'
import type { WorkspaceState } from '../types'
import { workspaceMessagesFetchInflight } from '../inflight'

type SetState = StoreApi<WorkspaceState>['setState']
type GetState = StoreApi<WorkspaceState>['getState']

export function buildChatSlice(set: SetState, get: GetState) {
  return {
    messages: [] as Message[],
    messagesCursor: null as string | null,
    messagesHasMore: false,
    nlpLoading: false,
    chatLoading: false,
    agentChatMessages: {} as Record<string, Message[]>,

    addMessage: (message: Message) => {
      set((s) => ({ messages: [...s.messages, message] }))
      const wsId = get().activeWorkspaceId
      if (wsId && !wsId.startsWith('ws-temp-')) {
        workspaceApi
          .saveMessage(wsId, {
            role: message.role,
            content: message.content || '',
            agentType: message.agentType,
            richBlocks: message.richBlocks ? JSON.stringify(message.richBlocks) : undefined,
          })
          .catch((err) => console.warn('Failed to persist message:', err))
      }
    },

    sendNLPMessage: (input: string) => {
      const wsId = get().activeWorkspaceId
      if (!wsId) return

      const sessionId = `s-${Math.floor(Date.now() / 300000)}`
      const ts = new Date().toISOString()

      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: 'user' as const,
        content: input,
        timestamp: ts,
        sessionId,
      }

      set((s) => ({
        nlpLoading: true,
        messages: [...s.messages, userMsg],
      }))

      if (!wsId.startsWith('ws-temp-')) {
        workspaceApi.saveMessage(wsId, { role: 'user', content: input }).catch((err) =>
          console.warn('Failed to persist user message:', err),
        )
      }

      const nlpCtx = buildNlpPhaseContext(get)
      agentApi
        .nlp(wsId, input, nlpCtx)
        .then((resp) => {
          const agentMsg = mapNLPResultToMessage(resp, sessionId)
          set((s) => ({
            nlpLoading: false,
            messages: [...s.messages, agentMsg],
          }))
          if (!wsId.startsWith('ws-temp-')) {
            workspaceApi
              .saveMessage(wsId, {
                role: agentMsg.role,
                content: agentMsg.content || '',
                agentType: agentMsg.agentType,
                richBlocks: agentMsg.richBlocks ? JSON.stringify(agentMsg.richBlocks) : undefined,
              })
              .catch((err) => console.warn('Failed to persist agent message:', err))
          }
          get().refreshActiveWorkspace()
        })
        .catch((err) => {
          const errContent = friendlyError(err.message)
          const errMsg: Message = {
            id: crypto.randomUUID(),
            role: 'agent' as const,
            content: errContent,
            agentType: 'pm' as AgentType,
            timestamp: new Date().toISOString(),
            sessionId,
          }
          set((s) => ({
            nlpLoading: false,
            messages: [...s.messages, errMsg],
          }))
          if (!wsId.startsWith('ws-temp-')) {
            workspaceApi
              .saveMessage(wsId, {
                role: 'agent',
                content: errContent,
                agentType: 'pm',
              })
              .catch(() => {})
          }
        })
    },

    sendAgentChatMessage: (agentType: string, input: string) => {
      const wsId = get().activeWorkspaceId
      if (!wsId) return
      const key = `${wsId}:${agentType}`
      const ts = new Date().toISOString()
      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content: input,
        timestamp: ts,
      }
      set((s) => ({
        chatLoading: true,
        agentChatMessages: {
          ...s.agentChatMessages,
          [key]: [...(s.agentChatMessages[key] || []), userMsg],
        },
      }))

      agentApi
        .chat(agentType, wsId, input)
        .then((resp) => {
          const agentMsg = mapAgentChatToMessage(resp, agentType)
          set((s) => ({
            chatLoading: false,
            agentChatMessages: {
              ...s.agentChatMessages,
              [key]: [...(s.agentChatMessages[key] || []), agentMsg],
            },
          }))
          get().refreshActiveWorkspace()
        })
        .catch((err) => {
          const errMsg: Message = {
            id: crypto.randomUUID(),
            role: 'agent',
            content: friendlyError(err.message),
            agentType: agentType as AgentType,
            timestamp: new Date().toISOString(),
          }
          set((s) => ({
            chatLoading: false,
            agentChatMessages: {
              ...s.agentChatMessages,
              [key]: [...(s.agentChatMessages[key] || []), errMsg],
            },
          }))
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
          { id: crypto.randomUUID(), role: 'user' as const, content: input, timestamp: ts, sessionId },
        ],
      }))

      if (persist) {
        workspaceApi.saveMessage(wsId, { role: 'user', content: input }).catch(() => {})
      }

      ;(async () => {
        let content = ''
        let agentType: AgentType = 'pm'
        const richBlocks: RichBlock[] = []
        try {
          set((s) => ({
            messages: [
              ...s.messages,
              {
                id: msgId,
                role: 'agent' as const,
                content: '',
                agentType,
                timestamp: new Date().toISOString(),
                sessionId,
              },
            ],
          }))

          const nlpCtx = buildNlpPhaseContext(get)
          for await (const evt of agentApi.nlpStream(wsId, input, nlpCtx)) {
            let data: any
            try {
              data = JSON.parse(evt.data)
            } catch {
              continue
            }

            if (evt.event === 'intent' && data.target_agent) {
              agentType = data.target_agent as AgentType
            }

            if (evt.event === 'requirement_preview') {
              // Remove any existing preview block before adding a new one
              const existingIdx = richBlocks.findIndex((b) => b.type === 'requirement_preview')
              if (existingIdx !== -1) richBlocks.splice(existingIdx, 1)
              richBlocks.push({
                type: 'requirement_preview',
                reqTitle: data.title,
                reqDescription: data.description,
                reqPriority: data.priority,
              })
              set((s) => ({
                messages: s.messages.map((m) =>
                  m.id === msgId ? { ...m, agentType, richBlocks: [...richBlocks] } : m,
                ),
              }))
              continue
            }

            if (data.delta) {
              content += data.delta
            } else if (data.summary || data.payload?.summary) {
              content = data.summary || data.payload?.summary || content
            } else if (data.error) {
              content = friendlyError(data.error)
            }

            if (data.payload?.artifacts) {
              for (const art of data.payload.artifacts) {
                richBlocks.push({
                  type: 'code',
                  title: art.title,
                  language: art.type === 'diagram' ? 'text' : art.type === 'adr' ? 'markdown' : art.type,
                  code: art.content,
                })
              }
            }
            if (data.payload?.created_tasks) {
              for (const t of data.payload.created_tasks) {
                richBlocks.push({ type: 'task_card', taskTitle: t.title || t.data?.title, taskStatus: 'pending' })
              }
            }
            if (data.rich_blocks) {
              for (const rb of data.rich_blocks) {
                if (rb.type === 'code')
                  richBlocks.push({ type: 'code', title: rb.title, language: rb.language, code: rb.content || rb.code })
                else if (rb.type === 'task_card')
                  richBlocks.push({ type: 'task_card', taskTitle: rb.content || rb.taskTitle, taskStatus: 'pending' })
              }
            }

            set((s) => ({
              messages: s.messages.map((m) =>
                m.id === msgId
                  ? { ...m, content, agentType, richBlocks: richBlocks.length > 0 ? [...richBlocks] : undefined }
                  : m,
              ),
            }))
          }
        } catch (err: any) {
          if (!content) {
            content = friendlyError(err.message)
            set((s) => ({
              messages: s.messages.map((m) => (m.id === msgId ? { ...m, content } : m)),
            }))
          }
        } finally {
          set({ nlpLoading: false })
          if (persist && content) {
            workspaceApi
              .saveMessage(wsId, {
                role: 'agent',
                content,
                agentType,
                richBlocks: richBlocks.length > 0 ? JSON.stringify(richBlocks) : undefined,
              })
              .catch(() => {})
          }
          get().refreshActiveWorkspace()
        }
      })()
    },

    sendAgentChatMessageStream: (agentType: string, input: string) => {
      const wsId = get().activeWorkspaceId
      if (!wsId) return
      const key = `${wsId}:${agentType}`
      const ts = new Date().toISOString()
      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content: input,
        timestamp: ts,
      }
      const replyId = crypto.randomUUID()

      set((s) => ({
        chatLoading: true,
        agentChatMessages: {
          ...s.agentChatMessages,
          [key]: [
            ...(s.agentChatMessages[key] || []),
            userMsg,
            { id: replyId, role: 'agent' as const, content: '', agentType: agentType as AgentType, timestamp: ts },
          ],
        },
      }))

      ;(async () => {
        let content = ''
        const richBlocks: RichBlock[] = []
        try {
          for await (const evt of streamSSE(`/api/agents/${agentType}/chat/stream`, {
            workspace_id: wsId,
            message: input,
          })) {
            let data: any
            try {
              data = JSON.parse(evt.data)
            } catch {
              continue
            }
            if (data.delta) {
              content += data.delta
            } else if (data.summary) {
              content = data.summary
            } else if (data.content) {
              content = data.content
            } else if (data.error) {
              content = friendlyError(data.error)
            }
            if (data.rich_blocks) {
              for (const rb of data.rich_blocks) {
                if (rb.type === 'code')
                  richBlocks.push({ type: 'code', title: rb.title, language: rb.language, code: rb.content || rb.code })
                else if (rb.type === 'task_card')
                  richBlocks.push({ type: 'task_card', taskTitle: rb.content || rb.taskTitle, taskStatus: 'pending' })
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
          }
        } catch (err: any) {
          if (!content) {
            set((s) => ({
              agentChatMessages: {
                ...s.agentChatMessages,
                [key]: (s.agentChatMessages[key] || []).map((m) =>
                  m.id === replyId ? { ...m, content: friendlyError(err.message) } : m,
                ),
              },
            }))
          }
        } finally {
          set({ chatLoading: false })
          get().refreshActiveWorkspace()
        }
      })()
    },

    fetchWorkspaceMessages: async (workspaceId?: string) => {
      const id = workspaceId ?? get().activeWorkspaceId
      if (!id || id.startsWith('ws-temp-')) return

      const inflight = workspaceMessagesFetchInflight.get(id)
      if (inflight) return inflight

      const run = (async () => {
        try {
          const msgResp = await workspaceApi
            .listMessages(id, undefined, 50)
            .catch(() => ({ data: [] as any[], hasMore: false, cursor: undefined as string | undefined }))
          if (get().activeWorkspaceId !== id) return

          const restored: Message[] = (msgResp.data || []).reverse().map((m: any) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            agentType: m.agentType,
            timestamp: m.createdAt,
            richBlocks: safeParseRichBlocks(m.richBlocks),
            sessionId: m.sessionId,
          }))

          set((s) => {
            if (s.activeWorkspaceId !== id) return {}
            return {
              messages: mergeMessagesById(restored, s.messages),
              messagesCursor: msgResp.cursor || null,
              messagesHasMore: msgResp.hasMore || false,
            }
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

    loadOlderMessages: () => {
      const wsId = get().activeWorkspaceId
      const cursor = get().messagesCursor
      if (!wsId || !cursor) return

      return workspaceApi
        .listMessages(wsId, cursor, 50)
        .then((resp) => {
          if (get().activeWorkspaceId !== wsId) return
          const older: Message[] = (resp.data || []).reverse().map((m: any) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            agentType: m.agentType,
            timestamp: m.createdAt,
            richBlocks: safeParseRichBlocks(m.richBlocks),
            sessionId: m.sessionId,
          }))
          set((s) => {
            if (s.activeWorkspaceId !== wsId) return {}
            return {
              messages: [...older, ...s.messages],
              messagesCursor: resp.cursor || null,
              messagesHasMore: resp.hasMore,
            }
          })
        })
        .catch((err) => console.error('Failed to load older messages:', err))
    },
  } satisfies Pick<
    WorkspaceState,
    | 'messages'
    | 'messagesCursor'
    | 'messagesHasMore'
    | 'nlpLoading'
    | 'chatLoading'
    | 'agentChatMessages'
    | 'addMessage'
    | 'sendNLPMessage'
    | 'sendAgentChatMessage'
    | 'sendNLPMessageStream'
    | 'sendAgentChatMessageStream'
    | 'fetchWorkspaceMessages'
    | 'loadOlderMessages'
  >
}
