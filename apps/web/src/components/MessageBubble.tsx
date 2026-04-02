import { useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bot, ThumbsUp, ThumbsDown, Pencil, Check, X } from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspace'
import { useUIStore } from '../stores/ui'
import { useT } from '../i18n'
import { feedbackApi } from '../lib/api'
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
  const [voted, setVoted] = useState<'approve' | 'reject' | 'edit' | null>(null)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const sendFeedback = useCallback(
    async (action: 'approve' | 'reject' | 'edit', modifiedOutput?: string) => {
      if (!activeWorkspaceId) return
      setVoted(action)
      try {
        await feedbackApi.send({
          workspace_id: activeWorkspaceId,
          message_id: msg.id,
          agent_type: msg.agentType || '',
          action_type: action,
          original_output: msg.content?.slice(0, 500) || '',
          ...(modifiedOutput ? { modified_output: modifiedOutput } : {}),
        })
        addToast({ type: 'success', message: t('feedback.thanks' as TranslationKey) })
      } catch {
        setVoted(null)
      }
    },
    [activeWorkspaceId, msg, addToast, t],
  )

  const handleEdit = () => {
    setEditText(msg.content || '')
    setEditing(true)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  const submitEdit = async () => {
    if (!editText.trim() || editText === msg.content) { setEditing(false); return }
    setEditing(false)
    await sendFeedback('edit', editText.trim())
  }

  return (
    <div className="mt-1 space-y-1.5">
      <div className="flex items-center gap-1">
        <button
          onClick={() => sendFeedback('approve')}
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
          onClick={() => sendFeedback('reject')}
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
        {!voted && (
          <button
            onClick={handleEdit}
            className="p-1 rounded-md transition-colors cursor-pointer text-text-tertiary/50 hover:text-accent hover:bg-accent/10"
            title={t('feedback.edit' as TranslationKey)}
          >
            <Pencil className="w-3 h-3" />
          </button>
        )}
      </div>
      <AnimatePresence>
        {editing && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-lg border border-accent/25 bg-surface-2/40 p-2">
              <textarea
                ref={textareaRef}
                value={editText}
                onChange={e => setEditText(e.target.value)}
                rows={3}
                className="w-full text-xs bg-transparent text-text-primary resize-none focus:outline-none"
              />
              <div className="flex justify-end gap-1.5 mt-1">
                <button onClick={() => setEditing(false)} className="p-1 rounded text-text-tertiary hover:text-text-secondary transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
                <button onClick={submitEdit} className="p-1 rounded text-accent hover:bg-accent/10 transition-colors">
                  <Check className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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
  const showReasoning =
    !!(reasoningTimeline || reasoningIntent) && richLayout !== 'home'
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
