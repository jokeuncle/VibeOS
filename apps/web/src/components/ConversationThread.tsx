import { useRef, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, X, Loader2, MessageCircle, Trash2 } from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspace'
import { useUIStore } from '../stores/ui'
import { useT } from '../i18n'
import { SystemMessage, UserBubble, AgentMessageRow } from './MessageBubble'
import type { Message, ConversationContext } from '../types'
import type { TranslationKey } from '../i18n/en'

const QUICK_START = [
  { id: 'ecommerce', key: 'nlp.quickStart.ecommerce' as TranslationKey },
  { id: 'blog', key: 'nlp.quickStart.blog' as TranslationKey },
  { id: 'dashboard', key: 'nlp.quickStart.dashboard' as TranslationKey },
]

interface ConversationThreadProps {
  context: ConversationContext
  workspaceId?: string
  requirementId?: string
  onDismiss?: () => void
  /** When true, only render header + scroll (no outer card chrome) — parent provides shell + input. Home + CommandBar use this. */
  embedInPanel?: boolean
}

export default function ConversationThread({
  context,
  workspaceId,
  requirementId,
  onDismiss,
  embedInPanel = false,
}: ConversationThreadProps) {
  const store = useWorkspaceStore()
  const {
    messages: wsMessages,
    homeMessages,
    nlpLoading,
    homeNlpLoading,
    messagesHasMore,
    homeMessagesHasMore,
    sendHomeNLPStream,
    fetchMessages,
    loadOlderMessages,
  } = store
  const {
    viewMode,
    setConversationVisible,
    conversationCollapsed,
    setConversationCollapsed,
    toggleConversation,
  } = useUIStore()
  const t = useT()
  const scrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const loadingOlder = useRef(false)

  const isHome = context === 'home'
  const isStreaming = isHome ? homeNlpLoading : nlpLoading
  const hasMore = isHome ? homeMessagesHasMore : messagesHasMore
  const activeReqId = useWorkspaceStore((s) => s.activeRequirementId)
  const collapsed = !!conversationCollapsed[context]

  const threadMessages = useMemo(() => {
    if (isHome) return homeMessages

    let filtered = wsMessages.filter((m) => {
      const wid = m.workspaceId
      return wid == null || wid === workspaceId
    })
    if (viewMode === 'requirements' && (requirementId || activeReqId)) {
      const rid = requirementId || activeReqId
      filtered = filtered.filter((m) => {
        return m.requirementId === rid || !m.requirementId
      })
    }
    return filtered.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  }, [isHome, homeMessages, wsMessages, workspaceId, requirementId, activeReqId, viewMode])

  const hasMessages = threadMessages.length > 0
  const visible = hasMessages && !collapsed

  const unreadCount = useMemo(() => {
    if (!hasMessages) return 0
    const lastUserIndex = [...threadMessages].reverse().findIndex((m) => m.role === 'user')
    if (lastUserIndex === -1) return threadMessages.filter((m) => m.role === 'agent').length
    const lastUserMsgIndex = threadMessages.length - 1 - lastUserIndex
    return threadMessages.slice(lastUserMsgIndex + 1).filter((m) => m.role === 'agent').length
  }, [threadMessages, hasMessages])

  useEffect(() => {
    setConversationVisible(context, hasMessages)
    return () => setConversationVisible(context, false)
  }, [hasMessages, context, setConversationVisible])

  useEffect(() => {
    if (scrollRef.current && visible) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [threadMessages, visible])

  useEffect(() => {
    if (isHome) {
      fetchMessages({ contextType: 'home' })
    }
  }, [isHome, fetchMessages])

  const handleLoadOlder = useCallback(() => {
    if (loadingOlder.current || !hasMore) return
    loadingOlder.current = true
    const scope = isHome ? { contextType: 'home' as const } : undefined
    try {
      loadOlderMessages(scope)
    } finally {
      setTimeout(() => { loadingOlder.current = false }, 1000)
    }
  }, [isHome, hasMore, loadOlderMessages])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !hasMore) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) handleLoadOlder() },
      { root: scrollRef.current, threshold: 0.1 },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, handleLoadOlder])

  function handleDismiss() {
    onDismiss?.()
  }

  function handleQuickStart(text: string) {
    sendHomeNLPStream(text)
  }

  if (!isHome && !workspaceId) return null

  // Collapsed pill when minimized but has messages
  if (collapsed && hasMessages) {
    const pillLabel = isHome
      ? t('nlp.homeAssistantPanel' as TranslationKey)
      : t('nlp.workspaceAssistantPanel' as TranslationKey)

    const pill = (
      <motion.button
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.2 }}
        onClick={() => toggleConversation(context)}
        className={
          embedInPanel
            ? 'flex items-center gap-2 px-4 py-2.5 rounded-full bg-accent/90 hover:bg-accent text-white shadow-lg hover:shadow-xl transition-all cursor-pointer backdrop-blur-sm'
            : 'fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-4 py-2.5 rounded-full bg-accent/90 hover:bg-accent text-white shadow-lg hover:shadow-xl transition-all cursor-pointer backdrop-blur-sm'
        }
        title={t('nlp.expandAssistant' as TranslationKey)}
      >
        <MessageCircle className="w-4 h-4" />
        <span className="text-xs font-medium">{pillLabel}</span>
        {unreadCount > 0 && (
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-white text-accent text-[10px] font-bold">
            {unreadCount}
          </span>
        )}
      </motion.button>
    )

    if (embedInPanel) {
      return (
        <div className="flex w-full shrink-0 justify-center pb-2 pt-0.5">
          {pill}
        </div>
      )
    }

    return pill
  }

  const lastAgentMsg = visible ? [...threadMessages].reverse().find((m) => m.role === 'agent') : undefined
  const lastAgentId = lastAgentMsg?.id
  const hasActionBlocks = lastAgentMsg?.richBlocks?.some((b) => b.type === 'nlp_action')
  const showQuickStart = isHome && visible && !isStreaming && !hasActionBlocks && threadMessages.length <= 2
    && lastAgentMsg && !lastAgentMsg.richBlocks?.some((b) => b.type === 'error_card')

  const panelTitle = isHome
    ? t('nlp.homeAssistantPanel' as TranslationKey)
    : t('nlp.workspaceAssistantPanel' as TranslationKey)

  const richLayout = isHome ? 'home' : undefined

  const shellClass = embedInPanel
    ? ''
    : 'rounded-2xl bg-surface-1/50 backdrop-blur-xl shadow-[0_20px_64px_-20px_rgba(0,0,0,.09),0_8px_28px_-12px_rgba(0,0,0,.05)]'

  const scrollRounding = embedInPanel ? '' : 'rounded-b-2xl'

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key={`conversation-${context}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.25 }}
          className={shellClass}
        >
          <div className={`px-4 py-3 border-b border-border-subtle/35 flex items-center gap-2 ${embedInPanel ? '' : 'rounded-t-2xl'}`}>
            <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-accent" />
            </div>
            <span className="text-xs font-medium text-text-secondary flex-1">
              {panelTitle}
            </span>
            {onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                className="p-1.5 rounded-lg text-text-tertiary hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer"
                title={t('nlp.clearConversation' as TranslationKey)}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setConversationCollapsed(context, true)}
              className="p-1.5 rounded-lg text-text-tertiary hover:text-text-secondary hover:bg-surface-2/80 transition-colors cursor-pointer"
              title={t('nlp.dismissAssistant' as TranslationKey)}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div
            ref={scrollRef}
            className={`min-h-[18rem] max-h-[min(70vh,38rem)] overflow-y-auto overflow-x-hidden p-3 pb-3.5 scroll-smooth ${scrollRounding}`}
          >
            <div className={`mx-auto w-full ${isHome ? 'max-w-xl' : 'max-w-2xl'} space-y-2.5`}>
              {hasMore && (
                <div ref={sentinelRef} className="flex justify-center py-1.5">
                  <span className="text-[10px] text-text-tertiary flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {t('conversation.loadOlder' as TranslationKey)}
                  </span>
                </div>
              )}

              {threadMessages.map((msg) => (
                <div key={msg.id}>
                  {msg.role === 'system' ? (
                    <SystemMessage msg={msg} />
                  ) : msg.role === 'user' ? (
                    <UserBubble msg={msg} />
                  ) : (
                    <AgentMessageRow
                      msg={msg}
                      isLastAgent={msg.id === lastAgentId}
                      isStreaming={isStreaming}
                      richLayout={richLayout}
                      showFeedback={!isHome}
                    />
                  )}
                </div>
              ))}

              {showQuickStart && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: 0.25 }}
                  className="space-y-1.5 ml-8"
                >
                  <span className="text-[10px] text-text-tertiary font-medium ml-0.5">
                    {t('nlp.quickStartHint' as TranslationKey)}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_START.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => handleQuickStart(t(s.key))}
                        className="px-3 py-1.5 rounded-lg bg-surface-2/60 border border-border-subtle text-[11px] text-text-secondary hover:bg-accent/10 hover:border-accent/20 hover:text-accent transition-all cursor-pointer"
                      >
                        {t(s.key)}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
