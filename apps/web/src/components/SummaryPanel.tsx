import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FileBarChart, ChevronDown, ChevronRight, MessageSquare, Activity, Sparkles, Loader2 } from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspace'
import { useUIStore } from '../stores/ui'
import { useT } from '../i18n'
import { workspaceApi } from '../lib/api'
import type { TranslationKey } from '../i18n/en'

interface ConversationSummary {
  id: string
  summary: string
  keyDecisions: string
  messageCount: number
  sessionId?: string
  agentType?: string
  createdAt: string
}

interface ActivitySummary {
  id: string
  summary: string
  keyEvents: string
  activityCount: number
  createdAt: string
}

function parseJSONSafe(val: string): string[] {
  if (!val) return []
  try {
    const parsed = JSON.parse(val)
    if (Array.isArray(parsed)) return parsed.map(String)
    return [String(parsed)]
  } catch {
    return val ? [val] : []
  }
}

function SummaryCard({ summary, items, label, countLabel, icon: Icon, time }: {
  summary: string
  items: string[]
  label: string
  countLabel: string
  icon: typeof MessageSquare
  time: string
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-lg border border-border-subtle bg-surface-1 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-2/50 transition-colors cursor-pointer"
      >
        <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
          <Icon className="w-3.5 h-3.5 text-accent" />
        </div>
        <div className="flex-1 text-left min-w-0">
          <p className="text-xs text-text-primary leading-relaxed line-clamp-2">{summary}</p>
          <span className="text-[10px] text-text-tertiary font-mono mt-0.5 block">
            {countLabel} · {new Date(time).toLocaleDateString()}
          </span>
        </div>
        {expanded
          ? <ChevronDown className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
          : <ChevronRight className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
        }
      </button>
      <AnimatePresence>
        {expanded && items.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-border-subtle px-4 py-3">
              <p className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">{label}</p>
              <ul className="space-y-1.5">
                {items.map((item, i) => (
                  <li key={i} className="flex gap-2 text-xs text-text-secondary leading-relaxed">
                    <span className="text-accent shrink-0 mt-0.5">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function SummaryPanel() {
  const { activeWorkspaceId, messages } = useWorkspaceStore()
  const { addToast } = useUIStore()
  const t = useT()

  const [convSummaries, setConvSummaries] = useState<ConversationSummary[]>([])
  const [actSummaries, setActSummaries] = useState<ActivitySummary[]>([])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    if (!activeWorkspaceId) return
    let cancelled = false
    setLoading(true)

    Promise.allSettled([
      workspaceApi.listConversationSummaries(activeWorkspaceId),
      workspaceApi.listActivitySummaries(activeWorkspaceId),
    ]).then(([convResult, actResult]) => {
      if (cancelled) return
      if (convResult.status === 'fulfilled') {
        setConvSummaries(Array.isArray(convResult.value) ? convResult.value : [])
      }
      if (actResult.status === 'fulfilled') {
        setActSummaries(Array.isArray(actResult.value) ? actResult.value : [])
      }
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })

    return () => { cancelled = true }
  }, [activeWorkspaceId])

  async function handleGenerate() {
    if (!activeWorkspaceId || generating) return
    setGenerating(true)
    try {
      const agentMessages = messages.filter((m) => m.role === 'agent' && m.content)
      if (agentMessages.length === 0) {
        addToast({ type: 'info', message: t('summary.empty' as TranslationKey) })
        return
      }

      const conversationContext = agentMessages.slice(-10).map((m) => m.content.slice(0, 500)).join('\n---\n')

      const resp = await fetch('/api/conversation/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: activeWorkspaceId,
          message: `请用中文总结当前工作空间的对话要点和关键决策，以JSON格式返回：{"summary":"总结内容","keyDecisions":["决策1","决策2"]}。对话内容：\n${conversationContext}`,
        }),
      })

      let summaryText = ''
      const reader = resp.body?.getReader()
      const decoder = new TextDecoder()
      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
            try {
              const d = JSON.parse(line.slice(6))
              if (d.delta) summaryText += d.delta
            } catch { /* skip non-json lines */ }
          }
        }
      }

      let parsed: { summary: string; keyDecisions: string[] }
      try {
        const jsonMatch = summaryText.match(/\{[\s\S]*\}/)
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { summary: summaryText.slice(0, 500), keyDecisions: [] }
      } catch {
        parsed = { summary: summaryText.slice(0, 500), keyDecisions: [] }
      }

      const result = await workspaceApi.createConversationSummary(activeWorkspaceId, {
        summary: parsed.summary,
        keyDecisions: JSON.stringify(parsed.keyDecisions),
        messageCount: messages.length,
      })
      setConvSummaries((prev) => [result, ...prev])
      addToast({ type: 'success', message: t('summary.title' as TranslationKey) })
    } catch {
      addToast({ type: 'error', message: t('error.requestFailed' as TranslationKey) })
    } finally {
      setGenerating(false)
    }
  }

  if (!activeWorkspaceId) return null

  const isEmpty = convSummaries.length === 0 && actSummaries.length === 0

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <FileBarChart className="w-3.5 h-3.5 text-text-tertiary" />
        <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
          {t('summary.title' as TranslationKey)}
        </span>
        <div className="flex-1 h-px bg-border-subtle" />
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-medium text-accent bg-accent/10 hover:bg-accent/20 rounded-md cursor-pointer transition-colors disabled:opacity-50"
        >
          {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          {generating ? t('summary.generating' as TranslationKey) : t('summary.generate' as TranslationKey)}
        </button>
      </div>

      {loading && (
        <div className="text-xs text-text-tertiary py-4 text-center">
          {t('artifact.loading' as TranslationKey)}
        </div>
      )}

      {!loading && isEmpty && (
        <div className="rounded-xl border border-border-subtle bg-surface-1/30 p-5 text-center">
          <p className="text-xs text-text-tertiary">{t('summary.empty' as TranslationKey)}</p>
        </div>
      )}

      {!loading && !isEmpty && (
        <div className="space-y-4">
          {convSummaries.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">
                {t('summary.conversations' as TranslationKey)}
              </p>
              <div className="space-y-2">
                {convSummaries.map((cs) => (
                  <SummaryCard
                    key={cs.id}
                    summary={cs.summary}
                    items={parseJSONSafe(cs.keyDecisions)}
                    label={t('summary.keyDecisions' as TranslationKey)}
                    countLabel={(t('summary.messageCount' as TranslationKey) as string).replace('{count}', String(cs.messageCount))}
                    icon={MessageSquare}
                    time={cs.createdAt}
                  />
                ))}
              </div>
            </div>
          )}

          {actSummaries.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">
                {t('summary.activities' as TranslationKey)}
              </p>
              <div className="space-y-2">
                {actSummaries.map((as_) => (
                  <SummaryCard
                    key={as_.id}
                    summary={as_.summary}
                    items={parseJSONSafe(as_.keyEvents)}
                    label={t('summary.keyEvents' as TranslationKey)}
                    countLabel={(t('summary.activityCount' as TranslationKey) as string).replace('{count}', String(as_.activityCount))}
                    icon={Activity}
                    time={as_.createdAt}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
