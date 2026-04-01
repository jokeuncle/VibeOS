import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Plus, Trash2, RefreshCw } from 'lucide-react'
import { extApi, registryApi, type SkillEntry } from '../lib/api'
import { useWorkspaceStore } from '../stores/workspace'
import { useT } from '../i18n'

export default function WorkspaceSkills() {
  const t = useT()
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? undefined
  const [skills, setSkills] = useState<SkillEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)

  const triggerSync = useCallback(async () => {
    if (!workspaceId) return
    try { await registryApi.syncCapabilities(workspaceId, ['skill']) } catch { /* ignore */ }
  }, [workspaceId])

  const load = useCallback(async () => {
    setLoading(true)
    try { setSkills(await extApi.listSkills(workspaceId)) } catch { /* ignore */ }
    setLoading(false)
    await triggerSync()
  }, [workspaceId, triggerSync])

  useEffect(() => { load() }, [load])

  const remove = async (id: string) => {
    try {
      await extApi.deleteSkill(id)
      setSkills(prev => prev.filter(s => s.id !== id))
      await triggerSync()
    } catch { /* ignore */ }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-text-secondary" />
          <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">{t('integrations.skills.panelTitle')}</h3>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="rounded-md border border-border-subtle bg-surface-2/40 px-2.5 py-1.5 text-[11px] font-medium text-text-secondary hover:bg-surface-2/60 transition-colors">
            <RefreshCw className="w-3 h-3" />
          </button>
          <button onClick={() => setShowAdd(v => !v)} className="rounded-md bg-accent px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-accent/90 transition-colors flex items-center gap-1">
            <Plus className="w-3 h-3" /> {t('integrations.skills.addSkill')}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showAdd && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <AddSkillForm workspaceId={workspaceId} onCreated={s => { setSkills(prev => [...prev, s]); setShowAdd(false); triggerSync() }} onCancel={() => setShowAdd(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="text-xs text-text-tertiary py-8 text-center">{t('integrations.loading')}</div>
      ) : skills.length === 0 ? (
        <div className="rounded-xl border border-border-subtle bg-surface-1/30 p-8 text-center">
          <Sparkles className="w-8 h-8 text-text-tertiary mx-auto mb-3 opacity-40" />
          <p className="text-xs text-text-tertiary">{t('integrations.skills.empty')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {skills.map(sk => (
            <div key={sk.id} className="rounded-xl border border-border-subtle bg-surface-1/30 px-4 py-3 flex items-center gap-3">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${sk.enabled ? 'bg-accent/10 text-accent' : 'bg-surface-3 text-text-tertiary'}`}>
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-semibold text-text-secondary">{sk.name}</div>
                <div className="text-[10px] text-text-tertiary">{sk.description || t('integrations.skills.noDescription')} &middot; {t('integrations.skills.versionLine').replace('{version}', sk.version)}</div>
              </div>
              <button onClick={() => remove(sk.id)} className="text-text-tertiary hover:text-red-400 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AddSkillForm({ workspaceId, onCreated, onCancel }: {
  workspaceId?: string; onCreated: (s: SkillEntry) => void; onCancel: () => void
}) {
  const t = useT()
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [prompt, setPrompt] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      const config: Record<string, unknown> = {}
      if (prompt.trim()) config.prompt_fragments = [prompt.trim()]
      const created = await extApi.createSkill({ name: name.trim(), description: desc, config, workspaceId })
      onCreated(created)
    } catch { /* ignore */ }
    setSaving(false)
  }

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-1/30 overflow-hidden">
      <div className="px-4 py-3 border-b border-border-subtle">
        <span className="text-[11px] font-semibold text-text-secondary">{t('integrations.skills.formTitle')}</span>
      </div>
      <div className="p-4 space-y-3">
        <div>
          <label className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider block mb-1">{t('integrations.skills.label.name')}</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder={t('integrations.skills.placeholder.name')} className="w-full text-xs rounded-lg bg-surface-2/40 border border-border-subtle px-3 py-2 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent/35" />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider block mb-1">{t('integrations.skills.label.description')}</label>
          <input value={desc} onChange={e => setDesc(e.target.value)} placeholder={t('integrations.skills.placeholder.description')} className="w-full text-xs rounded-lg bg-surface-2/40 border border-border-subtle px-3 py-2 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent/35" />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider block mb-1">{t('integrations.skills.label.promptInstructions')}</label>
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={4} placeholder={t('integrations.skills.placeholder.prompt')} className="w-full text-xs rounded-lg bg-surface-2/40 border border-border-subtle px-3 py-2 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent/35 resize-none" />
        </div>
      </div>
      <div className="border-t border-border-subtle px-4 py-3 flex justify-end gap-2 bg-surface-2/20">
        <button onClick={onCancel} className="rounded-md border border-border-subtle bg-surface-2/40 px-3 py-1.5 text-[11px] font-medium text-text-secondary">{t('common.cancel')}</button>
        <button onClick={submit} disabled={saving || !name.trim()} className="rounded-md bg-accent px-3 py-1.5 text-[11px] font-medium text-white disabled:opacity-50">{saving ? t('integrations.skills.action.adding') : t('integrations.skills.action.add')}</button>
      </div>
    </div>
  )
}
