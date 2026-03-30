import { useRef, useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X, ChevronDown } from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspace'
import { useT } from '../i18n'
import { MessageBubble, SystemMessage, TypingIndicator } from './MessageBubble'
import type { TranslationKey } from '../i18n/en'

interface MessageThreadProps {
  workspaceId: string
  requirementId?: string
}

export default function MessageThread({ workspaceId, requirementId }: MessageThreadProps) {
  const t = useT()
  const { workspaces, messages, nlpLoading, streamingMessageId } = useWorkspaceStore()
  const workspace = workspaces.find((w) => w.id === workspaceId)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)

  // Filter messages by workspace and optionally requirement
  const filteredMessages = useMemo(() => {
    let filtered = messages.filter((m) => m.workspaceId === workspaceId)
    if (requirementId) {
      filtered = filtered.filter((m) => m.requirementId === requirementId || !m.requirementId)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter((m) => m.content?.toLowerCase().includes(q))
    }
    return filtered.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  }, [messages, workspaceId, requirementId, searchQuery])

  // Group messages by session
  const sessionGroups = useMemo(() => {
    const groups: { sessionId?: string; messages: typeof filteredMessages }[] = []
    let currentGroup: typeof filteredMessages = []
    let currentSessionId: string | undefined

    filteredMessages.forEach((msg) => {
      if (msg.sessionId !== currentSessionId) {
        if (currentGroup.length > 0) {
          groups.push({ sessionId: currentSessionId, messages: currentGroup })
        }
        currentGroup = [msg]
        currentSessionId = msg.sessionId
      } else {
        currentGroup.push(msg)
      }
    })
    if (currentGroup.length > 0) {
      groups.push({ sessionId: currentSessionId, messages: currentGroup })
    }
    return groups
  }, [filteredMessages])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length, streamingMessageId])

  if (!workspace) return null

  return (
    <div className="flex flex-col h-full">
      {/* Header with search */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle bg-surface-1/50">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-text-secondary">{t('conversation.title' as TranslationKey)}</h3>
          <span className="text-[10px] text-text-tertiary">
            {filteredMessages.length} {t('summary.messageCount' as TranslationKey, { count: filteredMessages.length }).replace('{count}', String(filteredMessages.length))}
          </span>
        </div>
        <button
          onClick={() => setShowSearch(!showSearch)}
          className={`p-1.5 rounded-md transition-colors ${showSearch ? 'bg-accent/10 text-accent' : 'text-text-tertiary hover:text-text-secondary hover:bg-surface-2'}`}
        >
          {showSearch ? <X className="w-3.5 h-3.5" /> : <Search className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Search input */}
      <AnimatePresence>
        {showSearch && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-b border-border-subtle overflow-hidden"
          >
            <div className="px-4 py-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('command.placeholderHome' as TranslationKey)}
                  className="w-full pl-8 pr-8 py-1.5 text-xs bg-surface-2 border border-border-subtle rounded-lg outline-none focus:border-accent/50"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages list - increased height with flex-1 and min-h */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto min-h-[400px] p-4 space-y-4 scrollbar-thin scrollbar-thumb-surface-3 scrollbar-track-transparent"
      >
        {sessionGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-tertiary">
            <p className="text-xs">{t('conversation.loading' as TranslationKey)}</p>
          </div>
        ) : (
          sessionGroups.map((group, groupIdx) => (
            <div key={group.sessionId || `group-${groupIdx}`} className="space-y-3">
              {/* Session separator */}
              {groupIdx > 0 && (
                <div className="flex items-center gap-2 py-2">
                  <div className="flex-1 h-px bg-border-subtle/50" />
                  <span className="text-[10px] text-text-tertiary/50 uppercase tracking-wider">
                    {t('conversation.loadOlder' as TranslationKey)}
                  </span>
                  <ChevronDown className="w-3 h-3 text-text-tertiary/50" />
                  <div className="flex-1 h-px bg-border-subtle/50" />
                </div>
              )}

              {/* Messages in session */}
              {group.messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  isStreaming={streamingMessageId === msg.id}
                />
              ))}
            </div>
          ))
        )}

        {/* Typing indicator */}
        {nlpLoading && !streamingMessageId && (
          <div className="flex gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-accent/10 text-accent">
              <span className="w-3.5 h-3.5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
            </div>
            <div className="flex-1 min-w-0">
              <TypingIndicator />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
