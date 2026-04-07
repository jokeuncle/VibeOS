import type { StoreApi } from 'zustand'
import type { AgentType, Message, RichBlock, ExecutionStep, ContentSegment, ConversationContext } from '../../../types'
import {
  workspaceApi,
  globalMessageApi,
} from '../../../lib/api'
import { ExecutionSession } from '../../../lib/executionSession'
import {
  parseContentBlock,
  parseTimelineStep,
  parseToolStart,
  parseToolResult,
  parseToolConfirmation,
} from '../../../lib/sseEventParsers'
import {
  friendlyError,
  buildNlpPhaseContext,
  safeParseRichBlocks,
  safeParseSegments,
  mergeMessagesById,
  dedupeNearDuplicateMessages,
} from '../helpers'
import type { WorkspaceState, MessageScope } from '../types'
import { workspaceMessagesFetchInflight } from '../inflight'
import { useUIStore } from '../../ui'

type SetState = StoreApi<WorkspaceState>['setState']
type GetState = StoreApi<WorkspaceState>['getState']

const _RESOLVED_KEY = 'vibeos:tool_confirmations'

function _loadResolved(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(_RESOLVED_KEY) || '{}')
  } catch { return {} }
}

function markConfirmationResolved(key: string, status: 'confirmed' | 'rejected') {
  const map = _loadResolved()
  map[key] = status
  try { localStorage.setItem(_RESOLVED_KEY, JSON.stringify(map)) } catch { /* quota */ }
}

export function getConfirmationResolution(key: string): 'confirmed' | 'rejected' | null {
  return (_loadResolved()[key] as 'confirmed' | 'rejected') || null
}

function makeMsg(
  partial: Partial<Message> & { id: string; role: Message['role']; content: string; contextType: ConversationContext },
): Message {
  return { timestamp: new Date().toISOString(), ...partial }
}

export function buildChatSlice(set: SetState, get: GetState) {
  /**
   * Unified conversation handler using /api/conversation/stream.
   * Replaces the old NLP/chat/agentDM split.
   */
  function runConversation(
    wsId: string,
    input: string,
    msgId: string,
    isHome: boolean,
    options?: { targetAgent?: string; locale?: string },
  ) {
    let content = ''
    let pendingText = ''
    const agentType: AgentType = (options?.targetAgent as AgentType) || 'pm'
    const richBlocks: RichBlock[] = []
    const segments: ContentSegment[] = []
    const timelineSteps: ExecutionStep[] = []
    const persist = !isHome && !wsId.startsWith('ws-temp-')
    const agentDmKey = options?.targetAgent ? `${wsId}:${options.targetAgent}` : ''

    const flushText = () => {
      if (pendingText.trim()) {
        segments.push({ kind: 'text', text: pendingText })
        pendingText = ''
      }
    }

    const updateMsg = () => {
      const hasSegments = segments.length > 0 || pendingText.trim().length > 0
      const liveSegments: ContentSegment[] = hasSegments
        ? [...segments, ...(pendingText.trim() ? [{ kind: 'text' as const, text: pendingText }] : [])]
        : undefined as any
      const msg: Partial<Message> = {
        content, agentType,
        richBlocks: richBlocks.length > 0 ? [...richBlocks] : undefined,
        segments: liveSegments || undefined,
      }
      if (isHome) {
        set((s) => ({ homeMessages: s.homeMessages.map((m) => m.id === msgId ? { ...m, ...msg } : m) }))
      } else if (agentDmKey) {
        set((s) => ({
          agentChatMessages: {
            ...s.agentChatMessages,
            [agentDmKey]: (s.agentChatMessages[agentDmKey] || []).map((m) =>
              m.id === msgId ? { ...m, ...msg } : m,
            ),
          },
        }))
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

    const ctx = isHome ? { home: true } : buildNlpPhaseContext(get)
    const session = new ExecutionSession()
      .on('session', () => {})
      .on('timeline', (_action, data) => {
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
      })
      .on('tool', (action, data) => {
        if (action === 'start') {
          flushText()
          segments.push({ kind: 'tool_use', invocation: parseToolStart(data) })
        } else if (action === 'result') {
          const patch = parseToolResult(data)
          const seg = segments.find(
            (s): s is ContentSegment & { kind: 'tool_use' } =>
              s.kind === 'tool_use' && s.invocation.id === patch.id,
          )
          if (seg) Object.assign(seg.invocation, patch)
        } else if (action === 'confirmation') {
          flushText()
          segments.push({ kind: 'tool_confirmation', invocation: parseToolConfirmation(data) })
        }
        updateMsg()
      })
      .on('content', (action, data) => {
        if (action === 'delta' && data.delta) {
          content += data.delta
          pendingText += data.delta
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

    ;(async () => {
      try {
        const body: Record<string, unknown> = {
          workspace_id: wsId,
          message: input,
          ...(ctx && Object.keys(ctx).length > 0 ? { context: ctx } : {}),
        }
        if (options?.targetAgent) body.target_agent = options.targetAgent
        if (options?.locale) body.locale = options.locale

        await session.run('/api/conversation/stream', body)
      } catch (err: any) {
        const errMsg = friendlyError(err.message)
        if (!content) {
          richBlocks.push({
            type: 'error_card',
            errorSeverity: 'system_error',
            errorMessage: errMsg,
            errorActions: [{ id: 'retry', label: '重试', variant: 'primary' }],
          })
          updateMsg()
        }
      } finally {
        flushText()
        const finalSegments = segments.length > 0 ? segments : undefined
        if (isHome) {
          set({ homeNlpLoading: false })
          const hasAgentTurn = content.trim().length > 0 || richBlocks.length > 0 || (finalSegments && finalSegments.length > 0)
          if (hasAgentTurn) {
            globalMessageApi.save({
              role: 'agent',
              content: content.trim(),
              agentType,
              richBlocks: richBlocks.length > 0 ? JSON.stringify(richBlocks) : undefined,
              segments: finalSegments ? JSON.stringify(finalSegments) : undefined,
            }).catch(() => {})
          }
        } else {
          set({ nlpLoading: false, chatLoading: false })
          if (persist && (content.trim() || richBlocks.length > 0 || (finalSegments && finalSegments.length > 0))) {
            const ctxType = agentDmKey ? 'agent_dm' : 'workspace'
            workspaceApi.saveMessage(wsId, {
              role: 'agent', content: content.trim(), agentType,
              richBlocks: richBlocks.length > 0 ? JSON.stringify(richBlocks) : undefined,
              segments: finalSegments ? JSON.stringify(finalSegments) : undefined,
              contextType: ctxType,
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
      const segmentsJson = message.segments && message.segments.length > 0 ? JSON.stringify(message.segments) : undefined
      if (ctx === 'home') {
        set((s) => ({ homeMessages: [...s.homeMessages, message] }))
        globalMessageApi.save({
          role: message.role, content: message.content || '',
          agentType: message.agentType,
          richBlocks: message.richBlocks ? JSON.stringify(message.richBlocks) : undefined,
          segments: segmentsJson,
        }).catch((err) => console.warn('Failed to persist home message:', err))
      } else {
        set((s) => ({ messages: [...s.messages, message] }))
        const wsId = get().activeWorkspaceId
        if (wsId && !wsId.startsWith('ws-temp-')) {
          workspaceApi.saveMessage(wsId, {
            role: message.role, content: message.content || '',
            agentType: message.agentType,
            richBlocks: message.richBlocks ? JSON.stringify(message.richBlocks) : undefined,
            segments: segmentsJson,
            contextType: ctx, requirementId: message.requirementId,
            executionId: message.executionId,
          }).catch((err) => console.warn('Failed to persist message:', err))
        }
      }
    },

    sendNLPMessage: (input: string) => {
      get().sendNLPMessageStream(input)
    },

    sendAgentChatMessage: (agentType: string, input: string) => {
      get().sendAgentChatMessageStream(agentType, input)
    },

    sendNLPMessageStream: (input: string) => {
      const wsId = get().activeWorkspaceId
      if (!wsId) return
      useUIStore.getState().setConversationCollapsed('workspace', false)
      const ts = new Date().toISOString()
      const msgId = crypto.randomUUID()
      const persist = !wsId.startsWith('ws-temp-')

      set((s) => ({
        nlpLoading: true,
        messages: [
          ...s.messages,
          makeMsg({ id: crypto.randomUUID(), role: 'user', content: input, timestamp: ts, contextType: 'workspace', workspaceId: wsId }),
          makeMsg({ id: msgId, role: 'agent', content: '', agentType: 'pm', contextType: 'workspace', workspaceId: wsId }),
        ],
      }))
      if (persist) {
        workspaceApi.saveMessage(wsId, { role: 'user', content: input, contextType: 'workspace' }).catch(() => {})
      }
      runConversation(wsId, input, msgId, false)
    },

    sendAgentChatMessageStream: (agentType: string, input: string) => {
      const wsId = get().activeWorkspaceId
      if (!wsId) return
      const ts = new Date().toISOString()
      const msgId = crypto.randomUUID()
      const key = `${wsId}:${agentType}`
      const persist = !wsId.startsWith('ws-temp-')
      const userMsg = makeMsg({ id: crypto.randomUUID(), role: 'user', content: input, timestamp: ts, contextType: 'agent_dm', workspaceId: wsId })
      const agentMsg = makeMsg({ id: msgId, role: 'agent', content: '', agentType: agentType as AgentType, timestamp: ts, contextType: 'agent_dm', workspaceId: wsId })

      set((s) => ({
        chatLoading: true,
        agentChatMessages: {
          ...s.agentChatMessages,
          [key]: [...(s.agentChatMessages[key] || []), userMsg, agentMsg],
        },
      }))
      if (persist) {
        workspaceApi.saveMessage(wsId, { role: 'user', content: input, contextType: 'workspace' }).catch(() => {})
      }
      runConversation(wsId, input, msgId, false, { targetAgent: agentType })
    },

    clearHomeMessages: () => {
      set({ homeMessages: [], homeNlpLoading: false, homeMessagesCursor: undefined, homeMessagesHasMore: false })
      globalMessageApi.clear().catch(() => {})
    },

    clearWorkspaceConversation: () => {
      const wsId = get().activeWorkspaceId
      set({ messages: [], nlpLoading: false, messagesCursor: undefined, messagesHasMore: false })
      if (wsId) workspaceApi.deleteMessages(wsId).catch(() => {})
    },

    sendHomeNLPStream: (input: string) => {
      useUIStore.getState().setConversationCollapsed('home', false)
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
      runConversation('__home__', input, msgId, true)
    },

    sendToolConfirmation: (confirmationKey: string, approved: boolean, toolName: string, args?: Record<string, unknown>) => {
      const wsId = get().activeWorkspaceId || '__home__'
      const isHome = wsId === '__home__'

      markConfirmationResolved(confirmationKey, approved ? 'confirmed' : 'rejected')

      const newStatus = approved ? 'confirmed' as const : 'rejected' as const
      const patchSeg = (msgs: Message[]) =>
        msgs.map((m) => {
          if (!m.segments) return m
          const updated = m.segments.map((seg) =>
            seg.kind === 'tool_confirmation' && seg.invocation.confirmationKey === confirmationKey
              ? { ...seg, invocation: { ...seg.invocation, status: newStatus } }
              : seg,
          )
          const changed = updated.some((s, i) => s !== m.segments![i])
          return changed ? { ...m, segments: updated } : m
        })

      if (isHome) {
        set((s) => ({ homeMessages: patchSeg(s.homeMessages) }))
      } else {
        set((s) => ({ messages: patchSeg(s.messages) }))
      }

      if (!approved) return

      const msgId = crypto.randomUUID()
      const agentMsg = makeMsg({
        id: msgId, role: 'agent', content: '', agentType: 'pm',
        contextType: isHome ? 'home' : 'workspace', workspaceId: wsId,
      })
      if (isHome) {
        set((s) => ({ homeNlpLoading: true, homeMessages: [...s.homeMessages, agentMsg] }))
      } else {
        set((s) => ({ nlpLoading: true, messages: [...s.messages, agentMsg] }))
      }

      let content = ''
      const richBlocks: RichBlock[] = []
      const segments: ContentSegment[] = []
      const timelineSteps: ExecutionStep[] = []
      let pendingText = ''

      const flushText = () => {
        if (pendingText.trim()) {
          segments.push({ kind: 'text', text: pendingText })
          pendingText = ''
        }
      }

      const updateMsg = () => {
        const liveSegs: ContentSegment[] = segments.length > 0 || pendingText.trim().length > 0
          ? [...segments, ...(pendingText.trim() ? [{ kind: 'text' as const, text: pendingText }] : [])]
          : undefined as any
        const msg: Partial<Message> = {
          content, agentType: 'pm',
          richBlocks: richBlocks.length > 0 ? [...richBlocks] : undefined,
          segments: liveSegs || undefined,
        }
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

      const session = new ExecutionSession()
        .on('session', () => {})
        .on('timeline', (_action, data) => {
          const step = parseTimelineStep(data)
          const existing = timelineSteps.find((s) => s.id === step.id)
          if (existing) { existing.status = step.status; if (step.detail) existing.detail = step.detail }
          else timelineSteps.push(step)
          upsertTimeline()
          updateMsg()
        })
        .on('tool', (action, data) => {
          if (action === 'start') { flushText(); segments.push({ kind: 'tool_use', invocation: parseToolStart(data) }) }
          else if (action === 'result') {
            const patch = parseToolResult(data)
            const seg = segments.find(
              (s): s is ContentSegment & { kind: 'tool_use' } => s.kind === 'tool_use' && s.invocation.id === patch.id,
            )
            if (seg) Object.assign(seg.invocation, patch)
          }
          updateMsg()
        })
        .on('content', (action, data) => {
          if (action === 'delta' && data.delta) { content += data.delta; pendingText += data.delta }
          updateMsg()
        })

      ;(async () => {
        try {
          await session.run('/api/conversation/confirm', {
            confirmation_key: confirmationKey,
            approved: true,
            workspace_id: wsId,
            tool_name: toolName,
            arguments: args || {},
          })
        } catch { /* handled by finally */ }
        finally {
          flushText()
          if (isHome) set({ homeNlpLoading: false })
          else { set({ nlpLoading: false }); get().refreshActiveWorkspace() }
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
            segments: safeParseSegments(m.segments),
            sessionId: m.sessionId, contextType: 'home' as ConversationContext,
            workspaceId: m.workspaceId, requirementId: m.requirementId, executionId: m.executionId,
          }))
          set((s) => ({
            homeMessages: dedupeNearDuplicateMessages(mergeMessagesById(restored, s.homeMessages)),
            homeMessagesCursor: resp.cursor || null,
            homeMessagesHasMore: resp.hasMore || false,
          }))
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
            segments: safeParseSegments(m.segments),
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
            segments: safeParseSegments(m.segments),
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
          segments: safeParseSegments(m.segments),
          sessionId: m.sessionId, contextType: (m.contextType || 'workspace') as ConversationContext,
          workspaceId: m.workspaceId, requirementId: m.requirementId, executionId: m.executionId,
        }))
        set((s) => {
          if (s.activeWorkspaceId !== wsId) return {}
          return { messages: [...older, ...s.messages], messagesCursor: resp.cursor || null, messagesHasMore: resp.hasMore }
        })
      }).catch((err) => console.error('Failed to load older messages:', err))
    },
    injectWorkflowStepToChat: (event: { category: string; action: string; data: Record<string, unknown> }) => {
      if (!get().nlpLoading) return
      const msgs = get().messages
      const activeMsg = [...msgs].reverse().find((m) => m.role === 'agent' && !m.content?.trim())
      if (!activeMsg) return

      const label =
        event.data.phase
          ? `${event.data.phase}:${event.action}`
          : event.data.task_title
            ? `${event.data.task_title}`
            : `${event.category}:${event.action}`
      const step: ExecutionStep = {
        id: `ws-${event.category}-${event.action}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        label: label as string,
        status: event.action === 'error' ? 'error' : event.action === 'complete' ? 'completed' : event.action === 'start' ? 'running' : 'pending',
        detail: (event.data.result_summary || event.data.error || event.data.reason || '') as string,
      }

      const existing = activeMsg.richBlocks || []
      const timelineIdx = existing.findIndex((b) => b.type === 'execution_timeline')
      const timelineBlock: RichBlock = timelineIdx >= 0
        ? { ...existing[timelineIdx], steps: [...(existing[timelineIdx].steps || []), step] }
        : { type: 'execution_timeline', steps: [step] }
      const newBlocks = timelineIdx >= 0
        ? existing.map((b, i) => (i === timelineIdx ? timelineBlock : b))
        : [timelineBlock, ...existing]

      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === activeMsg.id ? { ...m, richBlocks: newBlocks } : m,
        ),
      }))
    },
  } satisfies Pick<
    WorkspaceState,
    | 'messages' | 'messagesCursor' | 'messagesHasMore'
    | 'nlpLoading' | 'chatLoading' | 'agentChatMessages'
    | 'homeMessages' | 'homeNlpLoading' | 'homeMessagesCursor' | 'homeMessagesHasMore'
    | 'addMessage' | 'sendNLPMessage' | 'sendAgentChatMessage'
    | 'sendNLPMessageStream' | 'sendAgentChatMessageStream'
    | 'sendHomeNLPStream' | 'sendToolConfirmation'
    | 'clearHomeMessages' | 'clearWorkspaceConversation'
    | 'fetchMessages' | 'fetchWorkspaceMessages' | 'loadOlderMessages'
    | 'injectWorkflowStepToChat'
  >
}
