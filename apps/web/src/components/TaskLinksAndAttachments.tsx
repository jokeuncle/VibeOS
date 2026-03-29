import { useCallback, useRef, useState } from 'react'
import { Link2, Paperclip, Upload, ExternalLink, X, Plus } from 'lucide-react'
import { useT } from '../i18n'
import type { TranslationKey } from '../i18n/en'

export type TaskRefLink = { id: string; url: string; label: string }

export type TaskLocalFile = { id: string; name: string; sizeLabel: string; file?: File }

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0 B'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function isValidHttpUrl(s: string): boolean {
  try {
    const u = new URL(s.trim())
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

type Variant = 'default' | 'compact'

export function TaskLinksAndAttachments({
  links,
  onLinksChange,
  files,
  onFilesChange,
  variant = 'default',
}: {
  links: TaskRefLink[]
  onLinksChange: (next: TaskRefLink[]) => void
  files: TaskLocalFile[]
  onFilesChange: (next: TaskLocalFile[]) => void
  variant?: Variant
}) {
  const t = useT()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [urlDraft, setUrlDraft] = useState('')
  const [labelDraft, setLabelDraft] = useState('')
  const [urlError, setUrlError] = useState(false)

  const isCompact = variant === 'compact'
  const labelCls = isCompact
    ? 'text-[10px] font-semibold text-text-secondary uppercase tracking-wider mb-2'
    : 'text-xs font-medium text-text-tertiary mb-1.5 flex items-center gap-1.5'

  const addFiles = useCallback(
    (list: FileList | File[]) => {
      const arr = Array.from(list)
      if (arr.length === 0) return
      const next: TaskLocalFile[] = [
        ...files,
        ...arr.map((file) => ({
          id: `f-${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: file.name,
          sizeLabel: formatBytes(file.size),
          file,
        })),
      ]
      onFilesChange(next)
    },
    [files, onFilesChange],
  )

  function handleAddLink() {
    const raw = urlDraft.trim()
    if (!raw) return
    let normalized = raw
    if (!/^https?:\/\//i.test(raw)) normalized = `https://${raw}`
    if (!isValidHttpUrl(normalized)) {
      setUrlError(true)
      return
    }
    setUrlError(false)
    onLinksChange([
      ...links,
      {
        id: `l-${Date.now()}`,
        url: normalized,
        label: labelDraft.trim() || normalized,
      },
    ])
    setUrlDraft('')
    setLabelDraft('')
  }

  return (
    <div className={isCompact ? 'space-y-4' : 'space-y-5'}>
      {/* Reference links (Feishu, Notion, etc.) */}
      <div>
        <label className={labelCls}>
          <Link2 className="w-3 h-3 shrink-0 text-text-tertiary" />
          {t('task.refLinks.title' as TranslationKey)}
        </label>
        <p className={`text-text-tertiary mb-2 ${isCompact ? 'text-[10px] leading-relaxed' : 'text-[11px] leading-relaxed'}`}>
          {t('task.refLinks.hint' as TranslationKey)}
        </p>
        <div className="flex flex-col gap-2">
          <div className={`flex gap-2 ${isCompact ? 'flex-col' : 'flex-col sm:flex-row'}`}>
            <input
              type="text"
              value={labelDraft}
              onChange={(e) => setLabelDraft(e.target.value)}
              placeholder={t('task.refLinks.labelPlaceholder' as TranslationKey)}
              className={`flex-1 rounded-lg bg-surface-2 border text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent/40 transition-colors ${
                isCompact ? 'px-2.5 py-1.5 text-xs border-border-subtle' : 'px-3 py-2 text-sm border-border-default'
              }`}
            />
            <input
              type="url"
              value={urlDraft}
              onChange={(e) => {
                setUrlDraft(e.target.value)
                setUrlError(false)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddLink()
              }}
              placeholder={t('task.refLinks.urlPlaceholder' as TranslationKey)}
              className={`flex-[2] min-w-0 rounded-lg bg-surface-2 border text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent/40 transition-colors font-mono ${
                isCompact ? 'px-2.5 py-1.5 text-xs border-border-subtle' : 'px-3 py-2 text-sm border-border-default'
              } ${urlError ? 'border-danger/50' : ''}`}
            />
            <button
              type="button"
              onClick={handleAddLink}
              disabled={!urlDraft.trim()}
              className={`shrink-0 inline-flex items-center justify-center gap-1 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                isCompact ? 'px-2.5 py-1.5 text-[11px]' : 'px-3 py-2 text-xs'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              {t('task.refLinks.add' as TranslationKey)}
            </button>
          </div>
          {urlError && (
            <p className="text-[11px] text-danger">{t('task.refLinks.invalidUrl' as TranslationKey)}</p>
          )}
        </div>
        {links.length > 0 ? (
          <ul className={`mt-2 space-y-1.5 ${isCompact ? '' : 'mt-3'}`}>
            {links.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface-2/40 border border-border-subtle group"
              >
                <ExternalLink className="w-3 h-3 text-accent shrink-0" />
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 min-w-0 text-xs text-accent hover:underline truncate"
                >
                  {item.label}
                </a>
                <button
                  type="button"
                  onClick={() => onLinksChange(links.filter((l) => l.id !== item.id))}
                  className="p-1 rounded-md text-text-tertiary hover:text-danger hover:bg-surface-3 opacity-0 group-hover:opacity-100 transition-all cursor-pointer shrink-0"
                  title={t('attachment.remove' as TranslationKey)}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className={`text-text-tertiary/70 mt-2 ${isCompact ? 'text-[10px]' : 'text-[11px]'}`}>
            {t('task.refLinks.empty' as TranslationKey)}
          </p>
        )}
      </div>

      {/* File attachments (UI only — no upload API) */}
      <div>
        <label className={labelCls}>
          <Paperclip className="w-3 h-3 shrink-0 text-text-tertiary" />
          {t('attachment.title')}
        </label>
        <p className={`text-text-tertiary mb-2 ${isCompact ? 'text-[10px] leading-relaxed' : 'text-[11px] leading-relaxed'}`}>
          {t('attachment.uiOnlyHint' as TranslationKey)}
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files)
            e.target.value = ''
          }}
        />
        {files.length > 0 && (
          <ul className="space-y-1 mb-2">
            {files.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface-2 border border-border-subtle text-xs group"
              >
                <Paperclip className="w-3 h-3 text-text-tertiary shrink-0" />
                <span className="text-text-primary flex-1 truncate">{a.name}</span>
                <span className="text-text-tertiary font-mono shrink-0">{a.sizeLabel}</span>
                <button
                  type="button"
                  onClick={() => onFilesChange(files.filter((f) => f.id !== a.id))}
                  className="p-1 rounded-md text-text-tertiary hover:text-danger opacity-0 group-hover:opacity-100 transition-all cursor-pointer shrink-0"
                  title={t('attachment.remove' as TranslationKey)}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setDragOver(true)
          }}
          onDragLeave={(e) => {
            e.preventDefault()
            setDragOver(false)
          }}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files)
          }}
          className={`w-full py-3 border-2 border-dashed rounded-lg text-xs transition-colors cursor-pointer flex flex-col items-center justify-center gap-1.5 ${
            dragOver
              ? 'border-accent/50 bg-accent/5 text-accent'
              : 'border-border-default text-text-tertiary hover:border-accent/30 hover:text-accent'
          }`}
        >
          <Upload className="w-4 h-4" />
          <span>{t('attachment.drop')}</span>
          <span className="text-[10px] text-text-tertiary/80">{t('attachment.browseHint' as TranslationKey)}</span>
        </button>
      </div>
    </div>
  )
}
