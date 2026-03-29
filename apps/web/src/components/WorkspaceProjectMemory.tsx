import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Brain, Trash2, Plus, Loader2, Sparkles } from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspace'
import { useUIStore } from '../stores/ui'
import { useT } from '../i18n'
import { platformApi } from '../lib/api'
import type { TranslationKey } from '../i18n/en'

function memoryId(m: Record<string, unknown>): string {
  return String(m.id ?? m.memory_id ?? '')
}

function memoryText(m: Record<string, unknown>): string {
  return String(m.memory ?? m.text ?? m.content ?? JSON.stringify(m))
}

export default function WorkspaceProjectMemory() {
  const t = useT()
  const { activeWorkspaceId, workspaces } = useWorkspaceStore()
  const { addToast } = useUIStore()
  const ws = workspaces.find((w) => w.id === activeWorkspaceId)

  const [items, setItems] = useState<Record<string, unknown>[]>([])
  const [prefsJson, setPrefsJson] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [newContent, setNewContent] = useState('')
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    if (!activeWorkspaceId) return
    setLoading(true)
    try {
      const [{ memories }, prefRes] = await Promise.all([
        platformApi.memory.list(activeWorkspaceId),
        platformApi.memory.preferences(activeWorkspaceId).catch(() => null),
      ])
      setItems(memories || [])
      setPrefsJson(prefRes ? JSON.stringify(prefRes.preferences, null, 2) : null)
    } catch {
      setItems([])
      setPrefsJson(null)
      addToast({ type: 'error', message: t('workspace.platform.unreachable' as TranslationKey) })
    } finally {
      setLoading(false)
    }
  }, [activeWorkspaceId, addToast, t])

  useEffect(() => {
    load()
  }, [load])

  async function handleAdd() {
    if (!activeWorkspaceId || !newContent.trim()) return
    setAdding(true)
    try {
      await platformApi.memory.add(activeWorkspaceId, newContent.trim())
      setNewContent('')
      addToast({ type: 'success', message: t('workspace.memory.added' as TranslationKey) })
      await load()
    } catch {
      addToast({ type: 'error', message: t('workspace.platform.unreachable' as TranslationKey) })
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(m: Record<string, unknown>) {
    const id = memoryId(m)
    if (!id) return
    try {
      await platformApi.memory.delete(id)
      addToast({ type: 'success', message: t('workspace.memory.deleted' as TranslationKey) })
      await load()
    } catch {
      addToast({ type: 'error', message: t('workspace.platform.unreachable' as TranslationKey) })
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
            <Brain className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-text-primary">{t('workspace.memory.title' as TranslationKey)}</h2>
            <p className="text-sm text-text-tertiary mt-1">{t('workspace.memory.subtitle' as TranslationKey)}</p>
            <p className="text-[11px] text-text-tertiary/80 mt-2 font-mono truncate">{ws.name}</p>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="rounded-xl border border-border-subtle bg-surface-1/30 p-5 space-y-3"
      >
        <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
          <Plus className="w-3.5 h-3.5" />
          {t('workspace.memory.addTitle' as TranslationKey)}
        </h3>
        <textarea
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          placeholder={t('workspace.memory.addPh' as TranslationKey)}
          rows={3}
          className="w-full bg-surface-2 border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent/50 resize-y"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={adding || !newContent.trim()}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 disabled:opacity-40 cursor-pointer transition-colors"
        >
          {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          {t('workspace.memory.addBtn' as TranslationKey)}
        </button>
      </motion.div>

      {prefsJson && prefsJson !== 'null' && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="rounded-xl border border-border-subtle bg-surface-1/30 p-5 space-y-2"
        >
          <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5" />
            {t('workspace.memory.prefs' as TranslationKey)}
          </h3>
          <pre className="text-[11px] text-text-tertiary font-mono whitespace-pre-wrap break-words max-h-40 overflow-y-auto rounded-lg bg-surface-0 p-3 border border-border-subtle">
            {prefsJson}
          </pre>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-xl border border-border-subtle bg-surface-1/30 overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-border-subtle flex items-center gap-2">
          <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
            {t('workspace.memory.listTitle' as TranslationKey)}
          </span>
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-text-tertiary ml-auto" />}
        </div>
        <div className="divide-y divide-border-subtle max-h-[480px] overflow-y-auto">
          {items.length === 0 && !loading ? (
            <p className="text-sm text-text-tertiary py-10 text-center px-4">{t('workspace.memory.empty' as TranslationKey)}</p>
          ) : (
            items.map((m, i) => {
              const id = memoryId(m)
              return (
                <div key={id || `m-${i}`} className="p-4 flex gap-3 group">
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap break-words">
                      {memoryText(m)}
                    </p>
                    {id && (
                      <p className="text-[10px] font-mono text-text-tertiary/70 truncate">{id}</p>
                    )}
                  </div>
                  {id && (
                    <button
                      type="button"
                      onClick={() => handleDelete(m)}
                      className="shrink-0 p-2 rounded-lg text-text-tertiary hover:text-danger hover:bg-surface-2 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                      title={t('workspace.memory.delete' as TranslationKey)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )
            })
          )}
        </div>
      </motion.div>
    </div>
  )
}
