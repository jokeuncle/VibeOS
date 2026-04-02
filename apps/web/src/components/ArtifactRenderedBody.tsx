import { Code2, Network, ExternalLink, Image as ImageIcon, FileText, FileCode2 } from 'lucide-react'
import type { Artifact } from '../types'
import type { TranslationKey } from '../i18n/en'
import { useT } from '../i18n'
import { MarkdownPreview } from './MarkdownPreview'
import { ToolOutputRenderer } from './ToolOutputRenderer'

export function parseArtifactFileUrl(metadata: string | undefined): string | null {
  if (!metadata || metadata === '{}') return null
  try {
    const parsed = JSON.parse(metadata) as { fileUrl?: string }
    return parsed.fileUrl || null
  } catch {
    return null
  }
}

const LANG_MAP: Record<string, string> = {
  schema: 'sql',
  api: 'yaml',
  code: 'typescript',
  adr: 'markdown',
  diagram: 'mermaid',
  test_code: 'typescript',
}

export function ArtifactRenderedBody({ artifact }: { artifact: Artifact }) {
  const t = useT()
  const artType = artifact.type
  const content = artifact.content || ''
  const fileUrl = parseArtifactFileUrl(artifact.metadata)

  if (artType === 'design_image' && fileUrl) {
    return (
      <div className="space-y-2">
        <div className="rounded-lg border border-border-subtle overflow-hidden bg-white">
          <iframe
            src={fileUrl}
            title={artifact.title}
            className="w-full border-0"
            style={{ height: 360 }}
            sandbox="allow-same-origin"
          />
        </div>
        <a
          href={fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
        >
          <ExternalLink className="w-3 h-3" />
          {t('artifact.openInTab' as TranslationKey)}
        </a>
      </div>
    )
  }

  if (
    artType === 'adr' ||
    artType === 'markdown' ||
    artType === 'prd_document' ||
    artType === 'design_spec' ||
    artType === 'test_plan'
  ) {
    return (
      <div className="rounded-lg border border-border-subtle overflow-hidden">
        <div className="bg-surface-2/30 px-2.5 py-1.5 max-h-[min(70vh,28rem)] overflow-y-auto tool-output-md">
          <MarkdownPreview text={content} />
        </div>
      </div>
    )
  }

  if (artType === 'diagram' || artType === 'mermaid') {
    return (
      <div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-3 border-b border-border-subtle rounded-t-lg">
          <Network className="w-3 h-3 text-text-tertiary" />
          <span className="text-[10px] font-mono text-text-tertiary">mermaid</span>
        </div>
        <div className="rounded-b-lg border-x border-b border-border-subtle border-t-0 overflow-hidden bg-surface-2/20 p-3">
          <ToolOutputRenderer text={content} variant="comfortable" />
        </div>
      </div>
    )
  }

  const lang = LANG_MAP[artType] || 'text'
  return (
    <div>
      <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-3 border-b border-border-subtle rounded-t-lg">
        <Code2 className="w-3 h-3 text-text-tertiary" />
        <span className="text-[10px] font-mono text-text-tertiary">{lang}</span>
      </div>
      <div className="rounded-b-lg border-x border-b border-border-subtle border-t-0 overflow-hidden bg-surface-2/20 p-3">
        <ToolOutputRenderer text={content} variant="comfortable" />
      </div>
    </div>
  )
}
