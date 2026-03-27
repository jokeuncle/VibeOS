import { useState } from 'react'
import { Bot, User, ArrowUp } from 'lucide-react'
import SlideOver from './ui/SlideOver'
import { useUIStore } from '../stores/ui'
import { useWorkspaceStore } from '../stores/workspace'
import { useT } from '../i18n'
import type { TranslationKey } from '../i18n/en'
import type { Message } from '../types'

export default function AgentChat() {
  const t = useT()
  const { agentChatOpen, agentChatAgentId, closeAgentChat } = useUIStore()
  const { activeWorkspaceId, workspaces } = useWorkspaceStore()

  const workspace = workspaces.find((w) => w.id === activeWorkspaceId)
  const agent = workspace?.agents.find((a) => a.id === agentChatAgentId || a.type === agentChatAgentId)

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')

  const nameKey = agent ? (`agent.name.${agent.type}` as TranslationKey) : 'agent.agents'

  function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim()) return

    const userMsg: Message = {
      id: `m-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
    }
    const agentMsg: Message = {
      id: `m-${Date.now() + 1}`,
      role: 'agent',
      content: t('agent.mockReply'),
      agentType: agent?.type,
      timestamp: new Date().toISOString(),
    }

    setMessages((prev) => [...prev, userMsg, agentMsg])
    setInput('')
  }

  function handleClose() {
    closeAgentChat()
    setMessages([])
    setInput('')
  }

  return (
    <SlideOver
      open={agentChatOpen}
      onClose={handleClose}
      title={agent ? `${t('agent.chat')} — ${t(nameKey)}` : t('agent.chat')}
    >
      {agent && (
        <div className="flex flex-col h-full -m-5">
          {/* Agent info */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-border-subtle">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-semibold ${
              agent.status === 'running' ? 'bg-accent/15 text-accent' : 'bg-surface-3 text-text-tertiary'
            }`}>
              {agent.avatar}
            </div>
            <div>
              <span className="text-sm font-medium text-text-primary">{t(nameKey)}</span>
              {agent.currentTask && (
                <p className="text-[11px] text-text-tertiary mt-0.5">{agent.currentTask}</p>
              )}
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-[200px]">
            {messages.length === 0 && (
              <div className="text-center py-12 text-xs text-text-tertiary">
                {t('agent.chatPlaceholder')}
              </div>
            )}
            {messages.map((msg) => (
              <div key={msg.id} className="flex gap-2.5">
                <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${
                  msg.role === 'user' ? 'bg-surface-3 text-text-tertiary' : 'bg-accent/10 text-accent'
                }`}>
                  {msg.role === 'user' ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
                </div>
                <div className="flex-1">
                  <span className="text-[11px] font-medium text-text-secondary">
                    {msg.role === 'user' ? t('conversation.you') : t(nameKey)}
                  </span>
                  <p className="text-xs text-text-primary/90 leading-relaxed mt-0.5">{msg.content}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Input */}
          <form onSubmit={handleSend} className="px-5 py-3 border-t border-border-subtle flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('agent.chatPlaceholder')}
              className="flex-1 px-3 py-2 rounded-lg bg-surface-2 border border-border-default text-xs text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent/40"
            />
            {input.trim() && (
              <button type="submit" className="w-7 h-7 rounded-lg bg-accent hover:bg-accent-hover flex items-center justify-center cursor-pointer transition-colors">
                <ArrowUp className="w-3.5 h-3.5 text-white" />
              </button>
            )}
          </form>
        </div>
      )}
    </SlideOver>
  )
}
