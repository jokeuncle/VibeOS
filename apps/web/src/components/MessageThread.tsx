import { useState, useRef, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bot, ChevronDown, Loader2, Search, X } from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspace'
import { useT } from '../i18n'
import { MessageBubble } from './MessageBubble'
import type { Message } from '../types'
import type { TranslationKey } from '../i18n/en'

interface Session {
  id: string
  messages: Message[]
  timestamp: string
}

function groupIntoSessions(messages: Message[]): Session[] {
  const sessions: Session[] = []
  let current: Session | null = null
  for (const msg of messages) {
    const sid = msg.sessionId || 'default'
    if (!current || current.id !== sid) {
      current = { id: sid, messages: [msg], timestamp: msg.timestamp }
      sessions.push(current)
    } else {
      current.messages.push(msg)
    }
  }
  return sessions
}

export default function MessageThread() {
  const messages = useWorkspaceStore((s) => s.messages)
  const messagesHasMore = useWorkspaceStore((s) => s.messagesHasMore)
  const loadOlderMessages = useWorkspaceStore((s) => s.loadOlderMessages)
  const nlpLoading = useWorkspaceStore((s) => s.nlpLoading)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const fetchWorkspaceMessages = useWorkspaceStore((s) => s.fetchWorkspaceMessages)
  const t = useT()
  const bottomRef = useRef<HTMLDivElement>(null)
  const [collapsedSessions, setCollapsedSessions] = useState<Set<string>>(new Set())
  const [loadingOlder, setLoadingOlder] = useState(false)
  const isLoadingOlderRef = useRef(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    if (activeWorkspaceId && !activeWorkspaceId.startsWith('ws-temp-')) {
      void fetchWorkspaceMessages(activeWorkspaceId)
    }
  }, [activeWorkspaceId, fetchWorkspaceMessages])

  const filteredMessages = useMemo(() => {
    if (!searchQuery.trim()) return messages
    const q = searchQuery.toLowerCase()
    return messages.filter((m) => m.content?.toLowerCase().includes(q))
  }, [messages, searchQuery])

  const displayMessages = searchOpen && searchQuery.trim() ? filteredMessages : messages
  const sessions = groupIntoSessions(displayMessages)
  const lastMsgContent = messages[messages.length - 1]?.content
  const lastMsgId = messages[messages.length - 1]?.id

  useEffect(() => {
    if (isLoadingOlderRef.current) {
      isLoadingOlderRef.current = false
      return
    }
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, lastMsgContent])

  if (messages.length === 0) return null

  function toggleSession(id: string) {
    setCollapsedSessions((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.35 }}
      className="rounded-xl border border-border-subtle bg-surface-1/30 overflow-hidden"
    >
      <div className="px-4 py-3 border-b border-border-subtle flex items-center gap-2">
        <Bot className="w-3.5 h-3.5 text-text-tertiary" />
        <span className="text-xs font-medium text-text-secondary">{t('conversation.title')}</span>
        <div className="flex-1" />
        {searchOpen ? (
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('search.placeholder' as TranslationKey)}
              className="w-40 px-2 py-1 text-[11px] rounded-md bg-surface-2 border border-border-default text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent/40"
            />
            <button
              onClick={() => { setSearchOpen(false); setSearchQuery('') }}
              className="p-1 rounded-md text-text-tertiary hover:text-text-secondary hover:bg-surface-3 cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setSearchOpen(true)}
            className="p-1 rounded-md text-text-tertiary hover:text-text-secondary hover:bg-surface-3 cursor-pointer"
          >
            <Search className="w-3.5 h-3.5" />
          </button>
        )}
        <span className="text-[10px] font-mono text-text-tertiary">{displayMessages.length}</span>
      </div>

      <div className="max-h-[500px] overflow-y-auto">
        {messagesHasMore && (
          <div className="flex justify-center py-2 border-b border-border-subtle">
            <button
              onClick={async () => {
                setLoadingOlder(true)
                isLoadingOlderRef.current = true
                try {
                  await loadOlderMessages()
                } finally {
                  setLoadingOlder(false)
                }
              }}
              disabled={loadingOlder}
              className="text-[10px] text-accent hover:text-accent-hover font-medium px-3 py-1 rounded-md bg-accent/5 hover:bg-accent/10 transition-colors cursor-pointer disabled:opacity-50"
            >
              {loadingOlder ? (
                <span className="flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> {t('conversation.loading' as TranslationKey)}
                </span>
              ) : (
                t('conversation.loadOlder' as TranslationKey)
              )}
            </button>
          </div>
        )}

        {searchOpen && searchQuery.trim() && filteredMessages.length === 0 && (
          <div className="py-8 text-center text-xs text-text-tertiary">
            {t('search.noResults' as TranslationKey)}
          </div>
        )}

        {sessions.map((session) => {
          const isCollapsed = collapsedSessions.has(session.id)
          return (
            <div key={session.id}>
              {sessions.length > 1 && (
                <button
                  onClick={() => toggleSession(session.id)}
                  className="w-full flex items-center gap-2 px-4 py-2 text-[10px] text-text-tertiary hover:bg-surface-2/30 cursor-pointer transition-colors"
                >
                  <div className="flex-1 h-px bg-border-subtle" />
                  <span className="font-mono shrink-0">
                    {new Date(session.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {isCollapsed && ` · ${session.messages.length} ${t('session.collapsed')}`}
                  </span>
                  <div className="flex-1 h-px bg-border-subtle" />
                  <ChevronDown className={`w-3 h-3 transition-transform ${isCollapsed ? '' : 'rotate-180'}`} />
                </button>
              )}
              <AnimatePresence initial={false}>
                {!isCollapsed && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="p-4 space-y-4">
                      {session.messages.map((msg) => (
                        <MessageBubble
                          key={msg.id}
                          msg={msg}
                          isStreaming={nlpLoading && msg.id === lastMsgId}
                        />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
    </motion.div>
  )
}
