import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Library, Search, FilePlus2, Loader2 } from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspace'
import { useUIStore } from '../stores/ui'
import { useT } from '../i18n'
import { platformApi, type RagSearchHit } from '../lib/api'
import type { TranslationKey } from '../i18n/en'

export default function WorkspaceKnowledgeBase() {
  const t = useT()
  const { activeWorkspaceId, workspaces } = useWorkspaceStore()
  const { addToast } = useUIStore()
  const ws = workspaces.find((w) => w.id === activeWorkspaceId)

  const [pointsCount, setPointsCount] = useState<number | null>(null)
  const [loadingMeta, setLoadingMeta] = useState(false)

  const [docTitle, setDocTitle] = useState('')
  const [docBody, setDocBody] = useState('')
  const [indexing, setIndexing] = useState(false)

  const [q, setQ] = useState('')
  const [searching, setSearching] = useState(false)
  const [hits, setHits] = useState<RagSearchHit[]>([])

  const loadMeta = useCallback(async () => {
    if (!activeWorkspaceId) return
    setLoadingMeta(true)
    try {
      const { collections } = await platformApi.rag.listCollections()
      const row = collections.find((c) => c.workspace_id === activeWorkspaceId)
      setPointsCount(row?.points_count ?? 0)
    } catch (e) {
      setPointsCount(null)
      addToast({
        type: 'error',
        message: t('workspace.platform.unreachable' as TranslationKey),
      })
    } finally {
      setLoadingMeta(false)
    }
  }, [activeWorkspaceId, addToast, t])

  useEffect(() => {
    loadMeta()
  }, [loadMeta])

  async function handleIndex() {
    if (!activeWorkspaceId || !docBody.trim()) return
    setIndexing(true)
    try {
      await platformApi.rag.indexDocuments(activeWorkspaceId, [
        { title: docTitle.trim() || t('workspace.rag.untitledDoc' as TranslationKey), content: docBody.trim(), doc_type: 'text' },
      ])
      setDocTitle('')
      setDocBody('')
      addToast({ type: 'success', message: t('workspace.rag.indexed' as TranslationKey) })
      await loadMeta()
    } catch {
      addToast({ type: 'error', message: t('workspace.platform.unreachable' as TranslationKey) })
    } finally {
      setIndexing(false)
    }
  }

  async function handleSearch() {
    if (!activeWorkspaceId || !q.trim()) return
    setSearching(true)
    try {
      const { results } = await platformApi.rag.search(activeWorkspaceId, q.trim(), 10)
      setHits(results || [])
    } catch {
      setHits([])
      addToast({ type: 'error', message: t('workspace.platform.unreachable' as TranslationKey) })
    } finally {
      setSearching(false)
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
            <Library className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-text-primary">{t('workspace.rag.title' as TranslationKey)}</h2>
            <p className="text-sm text-text-tertiary mt-1">{t('workspace.rag.subtitle' as TranslationKey)}</p>
            <p className="text-[11px] text-text-tertiary/80 mt-2 font-mono truncate">{ws.name}</p>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 text-xs text-text-secondary">
          <span>{t('workspace.rag.indexStatus' as TranslationKey)}</span>
          {loadingMeta ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-text-tertiary" />
          ) : pointsCount != null ? (
            <span className="font-mono text-text-tertiary tabular-nums">{pointsCount}</span>
          ) : (
            <span className="text-text-tertiary">—</span>
          )}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="rounded-xl border border-border-subtle bg-surface-1/30 p-5 space-y-4"
      >
        <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
          <FilePlus2 className="w-3.5 h-3.5" />
          {t('workspace.rag.addDoc' as TranslationKey)}
        </h3>
        <input
          value={docTitle}
          onChange={(e) => setDocTitle(e.target.value)}
          placeholder={t('workspace.rag.docTitlePh' as TranslationKey)}
          className="w-full bg-surface-2 border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent/50"
        />
        <textarea
          value={docBody}
          onChange={(e) => setDocBody(e.target.value)}
          placeholder={t('workspace.rag.docBodyPh' as TranslationKey)}
          rows={5}
          className="w-full bg-surface-2 border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent/50 resize-y min-h-[120px]"
        />
        <button
          type="button"
          onClick={handleIndex}
          disabled={indexing || !docBody.trim() || !activeWorkspaceId}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 disabled:opacity-40 cursor-pointer transition-colors"
        >
          {indexing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FilePlus2 className="w-4 h-4" />}
          {t('workspace.rag.indexBtn' as TranslationKey)}
        </button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-xl border border-border-subtle bg-surface-1/30 p-5 space-y-4"
      >
        <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
          <Search className="w-3.5 h-3.5" />
          {t('workspace.rag.searchTitle' as TranslationKey)}
        </h3>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder={t('workspace.rag.searchPh' as TranslationKey)}
            className="flex-1 bg-surface-2 border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent/50"
          />
          <button
            type="button"
            onClick={handleSearch}
            disabled={searching || !q.trim() || !activeWorkspaceId}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-surface-3 text-text-primary text-sm font-medium hover:bg-surface-4 disabled:opacity-40 cursor-pointer transition-colors shrink-0"
          >
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {t('workspace.rag.searchBtn' as TranslationKey)}
          </button>
        </div>
        <div className="space-y-3">
          {hits.length === 0 ? (
            <p className="text-sm text-text-tertiary py-6 text-center">{t('workspace.rag.noHits' as TranslationKey)}</p>
          ) : (
            hits.map((h, i) => (
              <div key={`${h.doc_id}-${i}`} className="rounded-lg border border-border-subtle bg-surface-0/80 p-3 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {h.title && <span className="text-xs font-medium text-text-secondary">{h.title}</span>}
                  {h.score != null && (
                    <span className="text-[10px] font-mono text-text-tertiary tabular-nums">
                      {(h.score as number).toFixed(3)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-text-primary/90 leading-relaxed whitespace-pre-wrap line-clamp-6">{h.text}</p>
              </div>
            ))
          )}
        </div>
      </motion.div>
    </div>
  )
}
