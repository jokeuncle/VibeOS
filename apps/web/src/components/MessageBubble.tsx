import { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Bot, User, Loader2, ThumbsUp, ThumbsDown } from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspace'
import { useUIStore } from '../stores/ui'
import { useT } from '../i18n'
import { feedbackApi, workspaceApi } from '../lib/api'
import { MarkdownContent } from './MessageMarkdown'
import { RichBlockRenderer } from './RichBlockRenderer'
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

function FeedbackButtons({ msg }: { msg: Message }) {
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

export function MessageBubble({ msg, isStreaming }: { msg: Message; isStreaming?: boolean }) {
  const t = useT()
  if (msg.role === 'system') return <SystemMessage msg={msg} />

  const isAgent = msg.role !== 'user'
  const agentLabel = msg.agentType
    ? t(`agent.name.${msg.agentType}` as TranslationKey)
    : t('conversation.agent')
  const showTyping = isStreaming && isAgent && !msg.content

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex gap-2.5 group"
    >
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
        msg.role === 'user' ? 'bg-surface-3 text-text-tertiary' : 'bg-accent/10 text-accent'
      }`}>
        {msg.role === 'user' ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-text-secondary">
            {msg.role === 'user' ? t('conversation.you') : agentLabel}
          </span>
          <span className="text-[10px] text-text-tertiary/50 font-mono">
            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        {showTyping && <TypingIndicator />}
        {msg.content && (
          isAgent
            ? <MarkdownContent text={msg.content} />
            : <p className="text-xs text-text-primary/90 leading-relaxed whitespace-pre-wrap">{msg.content}</p>
        )}
        {msg.richBlocks && msg.richBlocks.length > 0 && (
          <div className="space-y-2 mt-1">
            {msg.richBlocks.map((block, i) => <RichBlockRenderer key={i} block={block} />)}
          </div>
        )}
        {isAgent && msg.content && !isStreaming && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
            <FeedbackButtons msg={msg} />
          </div>
        )}
      </div>
    </motion.div>
  )
}
