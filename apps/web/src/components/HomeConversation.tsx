import { useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bot, Sparkles, X } from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspace'
import { useUIStore } from '../stores/ui'
import { useT } from '../i18n'
import { RichBlockRenderer } from './RichBlockRenderer'
import type { RichBlock } from '../types'
import type { TranslationKey } from '../i18n/en'

/** Home panel: chat-style Q&A only — no intent routing or timeline chrome; cards stack under the reply. */
const HOME_SUPPRESSED_TYPES = new Set<RichBlock['type']>(['intent_feedback', 'execution_timeline'])
const HOME_CARD_TYPES = new Set<RichBlock['type']>([
  'nlp_action',
  'task_card',
  'action_card',
  'cta_actions',
  'requirement_preview',
])

function partitionHomeRichBlocks(blocks: RichBlock[] | undefined) {
  if (!blocks?.length) return { inlineBlocks: [], cardBlocks: [] }
  const visible = blocks.filter((b) => !HOME_SUPPRESSED_TYPES.has(b.type))
  const cardBlocks = visible.filter((b) => HOME_CARD_TYPES.has(b.type))
  const inlineBlocks = visible.filter((b) => !HOME_CARD_TYPES.has(b.type))
  return { inlineBlocks, cardBlocks }
}

const QUICK_START = [
  { id: 'ecommerce', key: 'nlp.quickStart.ecommerce' as TranslationKey },
  { id: 'blog', key: 'nlp.quickStart.blog' as TranslationKey },
  { id: 'dashboard', key: 'nlp.quickStart.dashboard' as TranslationKey },
]

export default function HomeConversation() {
  const { homeMessages, homeNlpLoading, sendHomeNLPStream, clearHomeMessages } = useWorkspaceStore()
  const { setHomeConversationVisible } = useUIStore()
  const t = useT()
  const scrollRef = useRef<HTMLDivElement>(null)

  const visible = homeMessages.length > 0

  useEffect(() => {
    setHomeConversationVisible(visible)
    return () => setHomeConversationVisible(false)
  }, [visible, setHomeConversationVisible])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [homeMessages])

  function handleDismiss() {
    clearHomeMessages()
  }

  function handleQuickStart(text: string) {
    sendHomeNLPStream(text)
  }

  const lastAgentMsg = visible ? [...homeMessages].reverse().find((m) => m.role === 'agent') : undefined
  const hasActionBlocks = lastAgentMsg?.richBlocks?.some((b) => b.type === 'nlp_action')
  const isStreaming = homeNlpLoading
  const showQuickStart = visible && !isStreaming && !hasActionBlocks && homeMessages.length <= 2
    && lastAgentMsg && !lastAgentMsg.richBlocks?.some((b) => b.type === 'error_card')

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="home-conversation"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.25 }}
          className="rounded-xl border border-border-subtle bg-surface-1/30 backdrop-blur-md overflow-hidden shadow-lg shadow-black/10"
        >
          <div className="px-4 py-3 border-b border-border-subtle flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-accent" />
            </div>
            <span className="text-xs font-medium text-text-secondary flex-1">
              {t('nlp.homeAssistantPanel' as TranslationKey)}
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
            className="max-h-[min(50vh,22rem)] overflow-y-auto p-3 space-y-2.5 scroll-smooth"
          >
            {homeMessages.map((msg) => (
              <div key={msg.id}>
                {msg.role === 'user' ? (
                  <motion.div
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex justify-end"
                  >
                    <div className="px-3.5 py-2 rounded-2xl rounded-tr-sm bg-accent/10 border border-accent/15 text-xs text-text-primary max-w-[80%]">
                      {msg.content}
                    </div>
                  </motion.div>
                ) : (
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
                      {msg.content && (
                        <div className="px-3.5 py-2.5 rounded-2xl rounded-tl-sm bg-surface-2/80 border border-accent/10">
                          <p className="text-xs text-text-secondary leading-relaxed whitespace-pre-line">
                            {msg.content}
                          </p>
                        </div>
                      )}
                      {(() => {
                        const { inlineBlocks, cardBlocks } = partitionHomeRichBlocks(msg.richBlocks)
                        return (
                          <>
                            {inlineBlocks.map((block, i) => (
                              <div key={`i-${i}`}>
                                <RichBlockRenderer block={block} />
                              </div>
                            ))}
                            {cardBlocks.length > 0 && (
                              <div className="mt-1 w-full max-w-full space-y-2">
                                {cardBlocks.map((block, i) => (
                                  <div key={`c-${i}`} className="w-full min-w-0">
                                    <RichBlockRenderer block={block} richLayout="home" />
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        )
                      })()}
                    </div>
                  </motion.div>
                )}
              </div>
            ))}

            {isStreaming && !lastAgentMsg?.content && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-2"
              >
                <div className="w-6 h-6 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                  <Bot className="w-3 h-3 text-accent" />
                </div>
                <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl rounded-tl-sm bg-surface-2/60">
                  <span className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-accent/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-accent/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-accent/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                  <span className="text-[11px] text-text-tertiary">{t('nlp.generatingReply' as TranslationKey)}</span>
                </div>
              </motion.div>
            )}

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
        </motion.div>
      )}
    </AnimatePresence>
  )
}
