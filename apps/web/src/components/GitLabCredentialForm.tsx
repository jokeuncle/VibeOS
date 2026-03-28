import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { gitlabCredentialApi } from '../lib/api'
import { useT } from '../i18n'
import type { GitLabCredential } from '../types'

interface GitLabCredentialFormProps {
  onSaved: (cred: GitLabCredential) => void
  onError: (msg: string) => void
}

export default function GitLabCredentialForm({ onSaved, onError }: GitLabCredentialFormProps) {
  const t = useT()
  const [credUrl, setCredUrl] = useState('https://gitlab.com')
  const [credToken, setCredToken] = useState('')
  const [credLabel, setCredLabel] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!credUrl || !credToken) { onError(t('gitlab.urlRequired')); return }
    setSaving(true)
    try {
      const cred = await gitlabCredentialApi.create({
        gitlabUrl: credUrl,
        token: credToken,
        label: credLabel || credUrl,
      })
      onSaved(cred)
    } catch (e: any) {
      onError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="space-y-4">
        <p className="text-xs text-text-tertiary">{t('gitlab.credDesc')}</p>

        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">{t('gitlab.url')}</label>
          <input
            type="url"
            value={credUrl}
            onChange={(e) => setCredUrl(e.target.value)}
            placeholder="https://gitlab.com"
            className="w-full px-3 py-2 rounded-lg border border-border-default bg-surface-2 text-sm text-text-primary placeholder:text-text-quaternary focus:outline-none focus:ring-1 focus:ring-accent/50"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">{t('gitlab.pat')}</label>
          <input
            type="password"
            value={credToken}
            onChange={(e) => setCredToken(e.target.value)}
            placeholder="glpat-xxxxxxxxxxxx"
            className="w-full px-3 py-2 rounded-lg border border-border-default bg-surface-2 text-sm text-text-primary placeholder:text-text-quaternary focus:outline-none focus:ring-1 focus:ring-accent/50"
          />
          <p className="text-xs text-text-quaternary mt-1">{t('gitlab.patHint')}</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">{t('gitlab.label')}</label>
          <input
            type="text"
            value={credLabel}
            onChange={(e) => setCredLabel(e.target.value)}
            placeholder="Company GitLab"
            className="w-full px-3 py-2 rounded-lg border border-border-default bg-surface-2 text-sm text-text-primary placeholder:text-text-quaternary focus:outline-none focus:ring-1 focus:ring-accent/50"
          />
        </div>
      </div>

      <div className="shrink-0 flex items-center justify-end px-5 py-4 border-t border-border-subtle">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-xs font-semibold hover:bg-accent/90 transition-colors cursor-pointer disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          {t('gitlab.saveAndContinue')}
        </button>
      </div>
    </>
  )
}
