import { useRef, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bot, Sparkles, X, Loader2 } from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspace'
import { useUIStore } from '../stores/ui'
import { useT } from '../i18n'
import { RichBlockRenderer } from './RichBlockRenderer'
import { HomeReasoningPanel } from './HomeReasoningPanel'
import { SystemMessage } from './MessageBubble'
import { partitionNlpConversationRichBlocks, shouldShowAgentTextBubble } from '../lib/nlpConversationLayout'
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
}

export default function ConversationThread({
  context,
  workspaceId,
  requirementId,
  onDismiss,
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
  const { viewMode, setHomeConversationVisible, setWorkspaceConversationVisible } = useUIStore()
  const t = useT()
  const scrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const loadingOlder = useRef(false)

  const isHome = context === 'home'
  const isStreaming = isHome ? homeNlpLoading : nlpLoading
  const hasMore = isHome ? homeMessagesHasMore : messagesHasMore
  const activeReqId = useWorkspaceStore((s) => s.activeRequirementId)

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

  const visible = threadMessages.length > 0

  useEffect(() => {
    if (isHome) {
      setHomeConversationVisible(visible)
      return () => setHomeConversationVisible(false)
    } else {
      setWorkspaceConversationVisible(visible)
      return () => setWorkspaceConversationVisible(false)
    }
  }, [visible, isHome, setHomeConversationVisible, setWorkspaceConversationVisible])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [threadMessages])

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

  const lastAgentMsg = visible ? [...threadMessages].reverse().find((m) => m.role === 'agent') : undefined
  const lastAgentId = lastAgentMsg?.id
  const hasActionBlocks = lastAgentMsg?.richBlocks?.some((b) => b.type === 'nlp_action')
  const showQuickStart = isHome && visible && !isStreaming && !hasActionBlocks && threadMessages.length <= 2
    && lastAgentMsg && !lastAgentMsg.richBlocks?.some((b) => b.type === 'error_card')

  const panelTitle = isHome
    ? t('nlp.homeAssistantPanel' as TranslationKey)
    : t('nlp.workspaceAssistantPanel' as TranslationKey)

  const richLayout = isHome ? 'home' : undefined

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key={`conversation-${context}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.25 }}
          className="rounded-2xl bg-surface-1/50 backdrop-blur-xl shadow-[0_20px_64px_-20px_rgba(0,0,0,.09),0_8px_28px_-12px_rgba(0,0,0,.05)]"
        >
          <div className="px-4 py-3 border-b border-border-subtle/35 flex items-center gap-2 rounded-t-2xl">
            <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-accent" />
            </div>
            <span className="text-xs font-medium text-text-secondary flex-1">
              {panelTitle}
            </span>
            <button
              type="button"
              onClick={handleDismiss}
              className="p-1.5 rounded-lg text-text-tertiary hover:text-text-secondary hover:bg-surface-2/80 transition-colors cursor-pointer"
              title={t('nlp.dismissAssistant' as TranslationKey)}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div
            ref={scrollRef}
            className="max-h-[min(50vh,22rem)] overflow-y-auto overflow-x-hidden p-3 pb-3.5 scroll-smooth rounded-b-2xl"
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
                    <motion.div
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2 }}
                      className="flex justify-end"
                    >
                      <div className="px-3.5 py-2 rounded-2xl rounded-tr-sm bg-accent/10 border border-accent/15 text-xs text-text-primary max-w-[min(85%,20rem)]">
                        {msg.content}
                      </div>
                    </motion.div>
                  ) : (
                    <AgentMessageRow
                      msg={msg}
                      isLastAgent={msg.id === lastAgentId}
                      isStreaming={isStreaming}
                      richLayout={richLayout}
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

function AgentMessageRow({
  msg,
  isLastAgent,
  isStreaming,
  richLayout,
}: {
  msg: Message
  isLastAgent: boolean
  isStreaming: boolean
  richLayout?: string
}) {
  const t = useT()

  const { reasoningTimeline, reasoningIntent, inlineBlocks, cardBlocks } =
    partitionNlpConversationRichBlocks(msg.richBlocks)
  const showReasoning = !!(reasoningTimeline || reasoningIntent)
  const showTextBubble = shouldShowAgentTextBubble(msg.content, msg.richBlocks)
  const hasVisible =
    showTextBubble ||
    inlineBlocks.length > 0 ||
    cardBlocks.length > 0 ||
    showReasoning
  const agentRowStreaming = isStreaming && isLastAgent

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex items-start gap-2"
    >
      <div className="w-6 h-6 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 mt-0.5">
        <Bot className="w-3 h-3 text-accent" />
      </div>
      <div className="flex-1 space-y-2 min-w-0">
        {agentRowStreaming && !hasVisible ? (
          <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl rounded-tl-sm bg-surface-2/60 w-fit max-w-[min(100%,20rem)]">
            <span className="flex gap-1">
              <span className="w-1.5 h-1.5 bg-accent/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-accent/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-accent/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
            <span className="text-[11px] text-text-tertiary">{t('nlp.generatingReply' as TranslationKey)}</span>
          </div>
        ) : (
          <>
            {showReasoning && (
              <HomeReasoningPanel
                timelineBlock={reasoningTimeline}
                intentBlock={reasoningIntent}
                isStreaming={agentRowStreaming}
              />
            )}
            {showTextBubble && (
              <div className="px-3.5 py-2.5 rounded-2xl rounded-tl-sm bg-surface-2/80 border border-accent/10 w-fit max-w-[min(100%,26rem)]">
                <p className="text-xs text-text-secondary leading-relaxed whitespace-pre-line">
                  {msg.content}
                </p>
              </div>
            )}
            {inlineBlocks.map((block, i) => (
              <div key={`i-${i}`}>
                <RichBlockRenderer block={block} />
              </div>
            ))}
            {cardBlocks.length > 0 && (
              <div className="mt-1 w-full max-w-full space-y-2">
                {cardBlocks.map((block, i) => (
                  <div key={`c-${i}`} className="w-full min-w-0">
                    <RichBlockRenderer block={block} richLayout={richLayout === 'home' ? 'home' : undefined} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  )
}
