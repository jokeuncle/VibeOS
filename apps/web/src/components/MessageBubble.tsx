import { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Bot, ThumbsUp, ThumbsDown } from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspace'
import { useUIStore } from '../stores/ui'
import { useT } from '../i18n'
import { feedbackApi, workspaceApi } from '../lib/api'
import { RichBlockRenderer } from './RichBlockRenderer'
import { HomeReasoningPanel } from './HomeReasoningPanel'
import { partitionNlpConversationRichBlocks, shouldShowAgentTextBubble } from '../lib/nlpConversationLayout'
import type { Message } from '../types'
import type { TranslationKey } from '../i18n/en'

export function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 py-1">
      <span className="w-1.5 h-1.5 rounded-full bg-accent/60 animate-bounce" style={{ animationDelay: '0ms', animationDuration: '1s' }} />
      <span className="w-1.5 h-1.5 rounded-full bg-accent/60 animate-bounce" style={{ animationDelay: '150ms', animationDuration: '1s' }} />
      <span className="w-1.5 h-1.5 rounded-full bg-accent/60 animate-bounce" style={{ animationDelay: '300ms', animationDuration: '1s' }} />
    </div>
  )
}

export function StreamingDots({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl rounded-tl-sm bg-surface-2/60 w-fit max-w-[min(100%,20rem)]">
      <span className="flex gap-1">
        <span className="w-1.5 h-1.5 bg-accent/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-1.5 h-1.5 bg-accent/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-1.5 h-1.5 bg-accent/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </span>
      {label && <span className="text-[11px] text-text-tertiary">{label}</span>}
    </div>
  )
}

export function FeedbackButtons({ msg }: { msg: Message }) {
  const t = useT()
  const { addToast } = useUIStore()
  const { activeWorkspaceId } = useWorkspaceStore()
  const [voted, setVoted] = useState<'approve' | 'reject' | null>(null)

  const handleFeedback = useCallback(
    async (action: 'approve' | 'reject') => {
      if (voted || !activeWorkspaceId) return
      setVoted(action)
      try {
        await Promise.allSettled([
          feedbackApi.send({
            workspace_id: activeWorkspaceId,
            message_id: msg.id,
            agent_type: msg.agentType || '',
            action_type: action,
            original_output: msg.content?.slice(0, 500) || '',
          }),
          workspaceApi.createFeedbackSignal(activeWorkspaceId, {
            agentType: msg.agentType || '',
            actionType: action,
            originalOutput: msg.content?.slice(0, 1000) || '',
            context: JSON.stringify({ message_id: msg.id }),
          }),
        ])
        addToast({ type: 'success', message: t('feedback.thanks' as TranslationKey) })
      } catch {
        setVoted(null)
      }
    },
    [voted, activeWorkspaceId, msg, addToast, t],
  )

  return (
    <div className="flex items-center gap-1 mt-1">
      <button
        onClick={() => handleFeedback('approve')}
        disabled={voted !== null}
        className={`p-1 rounded-md transition-colors cursor-pointer ${
          voted === 'approve' ? 'text-success bg-success/10'
          : voted ? 'text-text-tertiary/30'
          : 'text-text-tertiary/50 hover:text-success hover:bg-success/10'
        }`}
        title={t('feedback.approve' as TranslationKey)}
      >
        <ThumbsUp className="w-3 h-3" />
      </button>
      <button
        onClick={() => handleFeedback('reject')}
        disabled={voted !== null}
        className={`p-1 rounded-md transition-colors cursor-pointer ${
          voted === 'reject' ? 'text-danger bg-danger/10'
          : voted ? 'text-text-tertiary/30'
          : 'text-text-tertiary/50 hover:text-danger hover:bg-danger/10'
        }`}
        title={t('feedback.reject' as TranslationKey)}
      >
        <ThumbsDown className="w-3 h-3" />
      </button>
    </div>
  )
}

export function SystemMessage({ msg }: { msg: Message }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2 py-0.5"
    >
      <div className="flex-1 h-px bg-border-subtle" />
      <span className="text-[10px] text-text-tertiary font-mono shrink-0">{msg.content}</span>
      <div className="flex-1 h-px bg-border-subtle" />
    </motion.div>
  )
}

export function UserBubble({ msg }: { msg: Message }) {
  return (
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
  )
}

export function AgentMessageRow({
  msg,
  isLastAgent,
  isStreaming,
  richLayout,
  showFeedback = false,
}: {
  msg: Message
  isLastAgent: boolean
  isStreaming: boolean
  richLayout?: string
  showFeedback?: boolean
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
      className="flex items-start gap-2 group"
    >
      <div className="w-6 h-6 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 mt-0.5">
        <Bot className="w-3 h-3 text-accent" />
      </div>
      <div className="flex-1 space-y-2 min-w-0">
        {agentRowStreaming && !hasVisible ? (
          <StreamingDots label={t('nlp.generatingReply' as TranslationKey)} />
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
            {showFeedback && showTextBubble && !agentRowStreaming && (
              <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                <FeedbackButtons msg={msg} />
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  )
}
