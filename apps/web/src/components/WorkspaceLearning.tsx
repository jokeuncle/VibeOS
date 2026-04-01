import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  ThumbsUp, ThumbsDown, Pencil, RefreshCw,
} from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspace'
import { workspaceApi, platformApi } from '../lib/api'
import { useT } from '../i18n'
import type { TranslationKey } from '../i18n/en'
import type { FeedbackSignal } from '../types'

const ACTION_META: Record<string, { icon: typeof ThumbsUp; color: string; labelKey: TranslationKey }> = {
  approve: { icon: ThumbsUp, color: 'text-success', labelKey: 'learning.approved' },
  reject:  { icon: ThumbsDown, color: 'text-danger', labelKey: 'learning.rejected' },
  edit:    { icon: Pencil, color: 'text-accent', labelKey: 'learning.edited' },
}

export default function WorkspaceLearning() {
  const t = useT()
  const activeWorkspaceId = useWorkspaceStore(s => s.activeWorkspaceId)
  const [signals, setSignals] = useState<FeedbackSignal[]>([])
  const [preferences, setPreferences] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!activeWorkspaceId) return
    setLoading(true)
    try {
      const [sigs, prefs] = await Promise.allSettled([
        workspaceApi.listFeedbackSignals(activeWorkspaceId, 30),
        platformApi.memory.preferences(activeWorkspaceId),
      ])
      if (sigs.status === 'fulfilled') setSignals(sigs.value)
      if (prefs.status === 'fulfilled') setPreferences(prefs.value.preferences as Record<string, unknown>)
    } catch { /* ignore */ }
    setLoading(false)
  }, [activeWorkspaceId])

  useEffect(() => { load() }, [load])

  if (loading) {
    return <div className="text-xs text-text-tertiary py-8 text-center">Loading...</div>
  }

  const prefEntries = preferences ? Object.entries(preferences) : []

  return (
    <div className="space-y-6">
      {/* Recent feedback */}
      <div className="rounded-xl border border-border-subtle bg-surface-1/30 overflow-hidden">
        <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">
            {t('learning.recentFeedback' as TranslationKey)}
          </span>
          <button
            onClick={load}
            className="text-text-tertiary hover:text-text-secondary transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
        <div className="p-4">
          {signals.length === 0 ? (
            <p className="text-xs text-text-tertiary text-center py-4">
              {t('learning.noFeedback' as TranslationKey)}
            </p>
          ) : (
            <div className="space-y-2">
              {signals.map(sig => {
                const meta = ACTION_META[sig.actionType] || ACTION_META.approve
                const Icon = meta.icon
                return (
                  <motion.div
                    key={sig.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-start gap-2.5 rounded-lg -mx-1 px-1 py-1.5 hover:bg-surface-2/35 transition-colors"
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 bg-surface-3 ${meta.color}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-[10px] font-semibold ${meta.color}`}>
                          {t(meta.labelKey)}
                        </span>
                        <span className="text-[10px] font-mono text-text-tertiary">
                          {sig.agentType}
                        </span>
                        <span className="text-[10px] text-text-tertiary ml-auto">
                          {new Date(sig.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      {sig.originalOutput && (
                        <p className="text-[11px] text-text-tertiary line-clamp-2">
                          {sig.originalOutput}
                        </p>
                      )}
                      {sig.modifiedOutput && (
                        <p className="text-[11px] text-accent/80 mt-0.5 line-clamp-2">
                          → {sig.modifiedOutput}
                        </p>
                      )}
                    </div>
                  </motion.div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Learned preferences */}
      <div className="rounded-xl border border-border-subtle bg-surface-1/30 overflow-hidden">
        <div className="px-4 py-3 border-b border-border-subtle">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">
            {t('learning.preferences' as TranslationKey)}
          </span>
        </div>
        <div className="p-4">
          {prefEntries.length === 0 ? (
            <p className="text-xs text-text-tertiary text-center py-4">
              {t('learning.noPreferences' as TranslationKey)}
            </p>
          ) : (
            <div className="space-y-2">
              {prefEntries.map(([key, value]) => (
                <div
                  key={key}
                  className="flex items-start gap-2 rounded-lg bg-surface-2/40 border border-border-subtle px-3 py-2"
                >
                  <span className="text-[11px] font-semibold text-text-secondary shrink-0">{key}</span>
                  <span className="text-[11px] text-text-tertiary break-all">
                    {typeof value === 'string' ? value : JSON.stringify(value)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
