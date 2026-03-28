import { motion } from 'framer-motion'
import { Bot, MessageCircle } from 'lucide-react'
import { useT } from '../i18n'
import { useUIStore } from '../stores/ui'
import type { Agent, AgentStatus } from '../types'
import type { TranslationKey } from '../i18n/en'

function AgentStatusBadge({ status }: { status: AgentStatus }) {
  const t = useT()
  const styles: Record<AgentStatus, string> = {
    running: 'bg-accent/10 text-accent border-accent/20',
    idle: 'bg-surface-3 text-text-tertiary border-border-subtle',
    waiting: 'bg-warning/10 text-warning border-warning/20',
    error: 'bg-danger/10 text-danger border-danger/20',
  }
  const key = `agent.status.${status}` as TranslationKey

  return (
    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md border ${styles[status]} ${status === 'running' ? 'animate-pulse' : ''}`}>
      {status === 'running' && <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent mr-1 animate-ping" />}
      {t(key)}
    </span>
  )
}

export default function AgentPanel({ agents }: { agents: Agent[] }) {
  const t = useT()
  const { openAgentChat } = useUIStore()
  const running = agents.filter((a) => a.status === 'running')
  const others = agents.filter((a) => a.status !== 'running')

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.3 }}
      className="rounded-xl border border-border-subtle bg-surface-1/30 overflow-hidden"
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border-subtle">
        <Bot className="w-4 h-4 text-text-tertiary" />
        <span className="text-xs font-medium text-text-secondary">{t('agent.agents')}</span>
        {running.length > 0 && (
          <span className="ml-auto flex items-center gap-1.5 text-[10px] text-accent font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-glow" />
            {running.length} {t('agent.active')}
          </span>
        )}
      </div>

      <div className="p-3 space-y-1">
        {[...running, ...others].map((agent) => {
          const nameKey = `agent.name.${agent.type}` as TranslationKey
          return (
            <button
              key={agent.id}
              onClick={() => openAgentChat(agent.id)}
              className={`w-full flex items-center gap-3 p-2.5 rounded-lg transition-colors cursor-pointer group ${
                agent.status === 'running' ? 'bg-accent/[0.04]' : 'hover:bg-surface-2/30'
              }`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-semibold ${
                agent.status === 'running' ? 'bg-accent/15 text-accent' : 'bg-surface-3 text-text-tertiary'
              }`}>
                {agent.avatar}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-text-primary truncate">{t(nameKey)}</span>
                  <AgentStatusBadge status={agent.status} />
                </div>
                {agent.currentTask && (
                  <p className="text-[11px] text-text-tertiary mt-0.5 truncate">{agent.currentTask}</p>
                )}
              </div>
              <MessageCircle className="w-3.5 h-3.5 text-text-tertiary/0 group-hover:text-text-tertiary transition-colors" />
            </button>
          )
        })}
      </div>
    </motion.div>
  )
}
