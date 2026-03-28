import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FileCode2, FileText, Database, Network, ChevronDown, ChevronRight, Copy, Check } from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspace'
import { useT } from '../i18n'
import { workspaceApi } from '../lib/api'
import type { Artifact } from '../types'

const ICON_MAP: Record<string, typeof FileCode2> = {
  schema: Database,
  api: Network,
  code: FileCode2,
  adr: FileText,
  diagram: Network,
}

const LANG_MAP: Record<string, string> = {
  schema: 'sql',
  api: 'yaml',
  code: 'typescript',
  adr: 'markdown',
  diagram: 'mermaid',
}

function ArtifactCard({ artifact }: { artifact: Artifact }) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const Icon = ICON_MAP[artifact.type] || FileText

  function handleCopy() {
    navigator.clipboard.writeText(artifact.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-1 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-2/50 transition-colors cursor-pointer"
      >
        <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-accent" />
        </div>
        <div className="flex-1 text-left min-w-0">
          <div className="text-sm font-medium text-text-primary truncate">{artifact.title}</div>
          <div className="text-[11px] text-text-tertiary font-mono">
            {artifact.type} &middot; {artifact.agentType} &middot; v{artifact.version}
          </div>
        </div>
        {expanded
          ? <ChevronDown className="w-4 h-4 text-text-tertiary shrink-0" />
          : <ChevronRight className="w-4 h-4 text-text-tertiary shrink-0" />
        }
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-border-subtle px-4 py-3">
              <div className="flex items-center justify-end mb-2">
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1 px-2 py-1 text-[11px] text-text-tertiary hover:text-text-secondary rounded-md hover:bg-surface-3 transition-colors cursor-pointer"
                >
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre className="text-xs text-text-secondary bg-surface-2 rounded-lg p-3 overflow-x-auto max-h-80 font-mono whitespace-pre-wrap">
                {artifact.content || '(empty)'}
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function ArtifactPanel() {
  const { activeWorkspaceId } = useWorkspaceStore()
  const t = useT()
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!activeWorkspaceId) return
    setLoading(true)
    workspaceApi.listArtifacts(activeWorkspaceId)
      .then((list) => setArtifacts(Array.isArray(list) ? list : []))
      .catch(() => setArtifacts([]))
      .finally(() => setLoading(false))
  }, [activeWorkspaceId])

  if (!activeWorkspaceId) return null

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
          {t('artifact.title')}
        </span>
        <span className="text-[10px] text-text-tertiary font-mono">
          ({artifacts.length})
        </span>
        <div className="flex-1 h-px bg-border-subtle" />
      </div>

      {loading && (
        <div className="text-xs text-text-tertiary py-4 text-center">Loading...</div>
      )}

      {!loading && artifacts.length === 0 && (
        <div className="text-xs text-text-tertiary py-4 text-center">
          {t('artifact.empty')}
        </div>
      )}

      <div className="space-y-2">
        {artifacts.map((art) => (
          <ArtifactCard key={art.id} artifact={art} />
        ))}
      </div>
    </div>
  )
}
