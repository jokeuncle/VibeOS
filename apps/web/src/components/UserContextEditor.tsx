import { useState, useEffect, useCallback } from 'react'
import { User, Save, RefreshCw } from 'lucide-react'
import { extApi } from '../lib/api'
import { useWorkspaceStore } from '../stores/workspace'
import { useT } from '../i18n'

export default function UserContextEditor({ userId }: { userId: string }) {
  const t = useT()
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? undefined
  const [instructions, setInstructions] = useState('')
  const [prefsText, setPrefsText] = useState('{}')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const ctx = await extApi.getUserContext(userId, workspaceId)
      setInstructions(ctx.customInstructions || '')
      setPrefsText(JSON.stringify(ctx.preferences || {}, null, 2))
    } catch {
      setInstructions('')
      setPrefsText('{}')
    }
    setLoading(false)
  }, [userId, workspaceId])

  useEffect(() => { load() }, [load])

  const save = async () => {
    setSaving(true)
    try {
      let prefs: Record<string, unknown> = {}
      try { prefs = JSON.parse(prefsText) } catch { /* keep empty */ }
      await extApi.upsertUserContext({
        userId,
        workspaceId,
        customInstructions: instructions,
        preferences: prefs,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch { /* ignore */ }
    setSaving(false)
  }

  if (loading) {
    return <div className="text-xs text-text-tertiary py-8 text-center">{t('integrations.loading')}</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-text-secondary" />
          <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
            {t('integrations.userContext.panelTitle')}
          </h3>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="rounded-md border border-border-subtle bg-surface-2/40 px-2.5 py-1.5 text-[11px] font-medium text-text-secondary hover:bg-surface-2/60 transition-colors">
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border-subtle bg-surface-1/30 overflow-hidden">
        <div className="p-4 space-y-4">
          <div>
            <label className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider block mb-1">
              {t('integrations.userContext.label.instructions')}
            </label>
            <p className="text-[10px] text-text-tertiary mb-2">
              {t('integrations.userContext.hint.instructions')}
            </p>
            <textarea
              value={instructions}
              onChange={e => setInstructions(e.target.value)}
              rows={5}
              placeholder={t('integrations.userContext.placeholder.instructions')}
              className="w-full text-xs rounded-lg bg-surface-2/40 border border-border-subtle px-3 py-2 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent/35 resize-none"
            />
          </div>

          <div>
            <label className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider block mb-1">
              {t('integrations.userContext.label.preferencesJson')}
            </label>
            <p className="text-[10px] text-text-tertiary mb-2">
              {t('integrations.userContext.hint.preferences')}
            </p>
            <textarea
              value={prefsText}
              onChange={e => setPrefsText(e.target.value)}
              rows={4}
              className="w-full text-xs rounded-lg bg-surface-2/40 border border-border-subtle px-3 py-2 text-text-primary font-mono focus:outline-none focus:ring-1 focus:ring-accent/35 resize-none"
            />
          </div>
        </div>

        <div className="border-t border-border-subtle px-4 py-3 flex justify-end gap-2 bg-surface-2/20">
          {saved && (
            <span className="text-[11px] text-green-400 self-center mr-2">{t('integrations.userContext.saved')}</span>
          )}
          <button
            onClick={save}
            disabled={saving}
            className="rounded-md bg-accent px-3 py-1.5 text-[11px] font-medium text-white hover:bg-accent/90 transition-colors disabled:opacity-50 flex items-center gap-1"
          >
            <Save className="w-3 h-3" />
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
