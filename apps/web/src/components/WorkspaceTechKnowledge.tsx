import { useState } from 'react'
import { motion } from 'framer-motion'
import { Share2, Search, FlaskConical, Loader2 } from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspace'
import { useUIStore } from '../stores/ui'
import { useT } from '../i18n'
import { platformApi, type KnowledgeDistillResponse } from '../lib/api'
import FormSelect from './ui/FormSelect'
import type { TranslationKey } from '../i18n/en'

export default function WorkspaceTechKnowledge() {
  const t = useT()
  const { activeWorkspaceId, workspaces } = useWorkspaceStore()
  const { addToast } = useUIStore()
  const ws = workspaces.find((w) => w.id === activeWorkspaceId)

  const [graphQ, setGraphQ] = useState('')
  const [graphSearching, setGraphSearching] = useState(false)
  const [graphResults, setGraphResults] = useState<Record<string, unknown>[]>([])

  const [level, setLevel] = useState<'team' | 'bu' | 'enterprise'>('team')
  const [distilling, setDistilling] = useState(false)
  const [distillOut, setDistillOut] = useState<KnowledgeDistillResponse | null>(null)

  async function handleGraphSearch() {
    if (!graphQ.trim()) return
    setGraphSearching(true)
    try {
      const { results } = await platformApi.knowledge.search(graphQ.trim(), 24)
      setGraphResults(results || [])
    } catch {
      setGraphResults([])
      addToast({ type: 'error', message: t('workspace.platform.unreachable' as TranslationKey) })
    } finally {
      setGraphSearching(false)
    }
  }

  async function handleDistill() {
    if (!activeWorkspaceId) return
    setDistilling(true)
    setDistillOut(null)
    try {
      const out = await platformApi.knowledge.distill(activeWorkspaceId, level)
      setDistillOut(out)
      addToast({ type: 'success', message: t('workspace.knowledge.distillDone' as TranslationKey) })
    } catch {
      addToast({ type: 'error', message: t('workspace.platform.unreachable' as TranslationKey) })
    } finally {
      setDistilling(false)
    }
  }

  if (!ws) return null

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-border-subtle bg-surface-1/30 p-5"
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center shrink-0 text-accent">
            <Share2 className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-text-primary">{t('workspace.knowledge.title' as TranslationKey)}</h2>
            <p className="text-sm text-text-tertiary mt-1">{t('workspace.knowledge.subtitle' as TranslationKey)}</p>
            <p className="text-[11px] text-text-tertiary/80 mt-2 font-mono truncate">{ws.name}</p>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="rounded-xl border border-border-subtle bg-surface-1/30 p-5 space-y-4"
      >
        <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
          <Search className="w-3.5 h-3.5" />
          {t('workspace.knowledge.graphSearch' as TranslationKey)}
        </h3>
        <p className="text-[11px] text-text-tertiary leading-relaxed">{t('workspace.knowledge.graphHint' as TranslationKey)}</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={graphQ}
            onChange={(e) => setGraphQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleGraphSearch()}
            placeholder={t('workspace.knowledge.graphPh' as TranslationKey)}
            className="flex-1 bg-surface-2 border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent/50"
          />
          <button
            type="button"
            onClick={handleGraphSearch}
            disabled={graphSearching || !graphQ.trim()}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-surface-3 text-text-primary text-sm font-medium hover:bg-surface-4 disabled:opacity-40 cursor-pointer transition-colors shrink-0"
          >
            {graphSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {t('workspace.knowledge.searchBtn' as TranslationKey)}
          </button>
        </div>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {graphResults.length === 0 ? (
            <p className="text-sm text-text-tertiary py-4 text-center">{t('workspace.knowledge.graphEmpty' as TranslationKey)}</p>
          ) : (
            graphResults.map((node, i) => (
              <pre
                key={i}
                className="text-[11px] font-mono text-text-secondary bg-surface-0 border border-border-subtle rounded-lg p-3 whitespace-pre-wrap break-words"
              >
                {JSON.stringify(node, null, 2)}
              </pre>
            ))
          )}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-xl border border-border-subtle bg-surface-1/30 p-5 space-y-4"
      >
        <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
          <FlaskConical className="w-3.5 h-3.5" />
          {t('workspace.knowledge.distillTitle' as TranslationKey)}
        </h3>
        <p className="text-[11px] text-text-tertiary leading-relaxed">{t('workspace.knowledge.distillHint' as TranslationKey)}</p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs text-text-secondary flex items-center gap-2 flex-wrap">
            <span className="shrink-0">{t('workspace.knowledge.accessLevel' as TranslationKey)}</span>
            <FormSelect
              size="sm"
              fullWidth={false}
              value={level}
              options={[
                { value: 'team', label: t('workspace.knowledge.level.team' as TranslationKey) },
                { value: 'bu', label: t('workspace.knowledge.level.bu' as TranslationKey) },
                { value: 'enterprise', label: t('workspace.knowledge.level.enterprise' as TranslationKey) },
              ]}
              onChange={(v) => setLevel(v as typeof level)}
              aria-label={t('workspace.knowledge.accessLevel' as TranslationKey)}
            />
          </label>
          <button
            type="button"
            onClick={handleDistill}
            disabled={distilling || !activeWorkspaceId}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 disabled:opacity-40 cursor-pointer transition-colors"
          >
            {distilling ? <Loader2 className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />}
            {t('workspace.knowledge.distillBtn' as TranslationKey)}
          </button>
        </div>
        {distillOut && (
          <div className="rounded-lg border border-border-subtle bg-surface-0 p-3 space-y-2">
            <p className="text-[11px] text-text-tertiary font-mono">
              stored: {distillOut.stored_count ?? 0} · level: {distillOut.target_access_level}
            </p>
            <pre className="text-[11px] font-mono text-text-secondary whitespace-pre-wrap break-words max-h-80 overflow-y-auto">
              {JSON.stringify(distillOut.extracted ?? distillOut, null, 2)}
            </pre>
          </div>
        )}
      </motion.div>
    </div>
  )
}
