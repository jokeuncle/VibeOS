import { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { FileText, Sparkles, Check, Loader2 } from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspace'
import { useUIStore } from '../stores/ui'
import { useT } from '../i18n'
import type { RichBlock } from '../types'
import type { TranslationKey } from '../i18n/en'

const PRIORITY_BADGE: Record<string, string> = {
  high: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  medium: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  low: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
}

export function RequirementPreviewCard({ block }: { block: RichBlock }) {
  const t = useT()
  const { activeWorkspaceId, createRequirement } = useWorkspaceStore()
  const { addToast } = useUIStore()
  const [title, setTitle] = useState(block.reqTitle ?? '')
  const [description, setDescription] = useState(block.reqDescription ?? '')
  const [confirming, setConfirming] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  const handleConfirm = useCallback(async () => {
    if (!activeWorkspaceId || confirming || confirmed) return
    setConfirming(true)
    try {
      await createRequirement(
        activeWorkspaceId,
        title.trim() || (block.reqTitle ?? ''),
        description.trim() || (block.reqDescription ?? ''),
      )
      setConfirmed(true)
    } catch {
      addToast({ type: 'error', message: t('error.requestFailed' as TranslationKey) })
    } finally {
      setConfirming(false)
    }
  }, [activeWorkspaceId, title, description, block, confirming, confirmed, createRequirement, addToast, t])

  const priority = block.reqPriority ?? 'medium'
  const badgeClass = PRIORITY_BADGE[priority] ?? PRIORITY_BADGE.medium

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-accent/25 bg-accent/[0.04] overflow-hidden"
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-accent/15">
        <div className="w-5 h-5 rounded-md bg-accent/15 flex items-center justify-center">
          <FileText className="w-3 h-3 text-accent" />
        </div>
        <span className="text-[11px] font-semibold text-accent">{t('requirement.preview.label' as TranslationKey)}</span>
        <span className={`ml-auto text-[9px] font-mono px-1.5 py-0.5 rounded border ${badgeClass}`}>
          {priority.toUpperCase()}
        </span>
      </div>
      <div className="p-3 space-y-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={confirmed}
          placeholder={t('requirement.titlePlaceholder' as TranslationKey)}
          className="w-full bg-transparent text-xs font-semibold text-text-primary outline-none border-b border-transparent focus:border-accent/30 pb-0.5 transition-colors disabled:opacity-60"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={confirmed}
          rows={3}
          placeholder={t('requirement.descPlaceholder' as TranslationKey)}
          className="w-full bg-transparent text-[11px] text-text-secondary leading-relaxed outline-none resize-none disabled:opacity-60"
        />
      </div>
      <div className="flex items-center gap-2 px-3 py-2 border-t border-accent/15">
        {confirmed ? (
          <span className="flex items-center gap-1.5 text-[11px] text-success font-medium">
            <Check className="w-3 h-3" />
            {t('requirement.preview.created' as TranslationKey)}
          </span>
        ) : (
          <button
            onClick={handleConfirm}
            disabled={confirming || !title.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-[11px] font-medium cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {confirming ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            {t('requirement.preview.confirm' as TranslationKey)}
          </button>
        )}
      </div>
    </motion.div>
  )
}
