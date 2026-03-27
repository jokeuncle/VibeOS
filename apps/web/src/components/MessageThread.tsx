import { motion } from 'framer-motion'
import { Bot, User } from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspace'
import { useT } from '../i18n'

export default function MessageThread() {
  const { messages } = useWorkspaceStore()
  const t = useT()

  if (messages.length === 0) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.35 }}
      className="rounded-xl border border-border-subtle bg-surface-1/30 overflow-hidden"
    >
      <div className="px-4 py-3 border-b border-border-subtle">
        <span className="text-xs font-medium text-text-secondary">
          {t('conversation.title')}
        </span>
      </div>
      <div className="p-3 space-y-3 max-h-64 overflow-y-auto">
        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-2.5"
          >
            <div
              className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${
                msg.role === 'user'
                  ? 'bg-surface-3 text-text-tertiary'
                  : 'bg-accent/10 text-accent'
              }`}
            >
              {msg.role === 'user' ? (
                <User className="w-3 h-3" />
              ) : (
                <Bot className="w-3 h-3" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[11px] font-medium text-text-secondary">
                  {msg.role === 'user'
                    ? t('conversation.you')
                    : msg.agentType
                      ? `${msg.agentType} ${t('conversation.agent')}`
                      : t('conversation.agent')}
                </span>
                <span className="text-[10px] text-text-tertiary/50 font-mono">
                  {new Date(msg.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <p className="text-xs text-text-primary/90 leading-relaxed">
                {msg.content}
              </p>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}
