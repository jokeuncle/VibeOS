import { useState, useRef, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Sparkles, ArrowUp, Command } from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspace'
import { useUIStore } from '../stores/ui'
import { useT } from '../i18n'

export default function CommandBar() {
  const [input, setInput] = useState('')
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { activeWorkspaceId, addMessage } = useWorkspaceStore()
  const { setHomeSearchQuery } = useUIStore()
  const t = useT()

  useEffect(() => {
    if (!activeWorkspaceId) {
      setHomeSearchQuery(input)
    }
  }, [input, activeWorkspaceId, setHomeSearchQuery])

  useEffect(() => {
    setInput('')
    setHomeSearchQuery('')
  }, [activeWorkspaceId, setHomeSearchQuery])

  const handleKeydown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      inputRef.current?.focus()
    }
    if (e.key === 'Escape') {
      inputRef.current?.blur()
      setFocused(false)
    }
  }, [])

  useEffect(() => {
    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [handleKeydown])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim()) return
    if (!activeWorkspaceId) return

    addMessage({
      id: `msg-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
    })

    addMessage({
      id: `msg-${Date.now() + 1}`,
      role: 'agent',
      content: t('conversation.mockReply'),
      agentType: 'pm',
      timestamp: new Date().toISOString(),
    })

    setInput('')
  }

  return (
    <div className="relative z-40">
      <form
        onSubmit={handleSubmit}
        className={`
          mx-4 mb-3 flex items-center gap-3 px-4 h-12 rounded-2xl border transition-all duration-300
          ${
            focused
              ? 'border-accent/40 bg-surface-2 shadow-[0_0_30px_rgba(99,102,241,0.08)]'
              : 'border-border-default bg-surface-1 hover:border-border-strong'
          }
        `}
      >
        <Sparkles
          className={`w-4 h-4 shrink-0 transition-colors ${
            focused ? 'text-accent' : 'text-text-tertiary'
          }`}
        />

        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={
            activeWorkspaceId
              ? t('command.placeholder')
              : t('command.placeholderHome')
          }
          className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary outline-none"
        />

        {input.trim() && activeWorkspaceId ? (
          <motion.button
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            type="submit"
            className="w-7 h-7 rounded-lg bg-accent hover:bg-accent-hover flex items-center justify-center transition-colors cursor-pointer"
          >
            <ArrowUp className="w-4 h-4 text-white" />
          </motion.button>
        ) : (
          <kbd className="hidden sm:flex items-center gap-0.5 text-[10px] text-text-tertiary bg-surface-3 px-1.5 py-0.5 rounded-md border border-border-subtle font-mono">
            <Command className="w-2.5 h-2.5" />K
          </kbd>
        )}
      </form>
    </div>
  )
}
