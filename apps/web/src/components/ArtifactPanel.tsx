import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileCode2, FileText, Database, Network, ChevronDown, ChevronRight,
  Copy, Check, Download, ExternalLink, Image as ImageIcon,
} from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspace'
import { useT } from '../i18n'
import { workspaceApi } from '../lib/api'
import type { Artifact } from '../types'
import type { TranslationKey } from '../i18n/en'
import { ArtifactRenderedBody, parseArtifactFileUrl } from './ArtifactRenderedBody'

const ICON_MAP: Record<string, typeof FileCode2> = {
  schema: Database,
  api: Network,
  code: FileCode2,
  adr: FileText,
  diagram: Network,
  design_image: ImageIcon,
  design_spec: FileText,
  test_code: FileCode2,
  test_plan: FileText,
  prd_document: FileText,
}

function ArtifactCard({ artifact }: { artifact: Artifact }) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const Icon = ICON_MAP[artifact.type] || FileText
  const fileUrl = parseArtifactFileUrl(artifact.metadata)

  function handleCopy() {
    navigator.clipboard.writeText(artifact.content).catch(() => {})
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
          {!expanded && artifact.content && (
            <div className="text-[10px] text-text-tertiary mt-0.5 truncate max-w-[300px]">
              {artifact.content.slice(0, 120).replace(/\n/g, ' ')}
            </div>
          )}
        </div>
        {fileUrl && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-medium shrink-0">
            CDN
          </span>
        )}
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
              <div className="flex items-center justify-end gap-1 mb-2">
                {fileUrl && (
                  <a
                    href={fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    download
                    className="flex items-center gap-1 px-2 py-1 text-[11px] text-text-tertiary hover:text-text-secondary rounded-md hover:bg-surface-3 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Download className="w-3 h-3" />
                    {t('artifact.download' as TranslationKey)}
                  </a>
                )}
                {fileUrl && (
                  <a
                    href={fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 px-2 py-1 text-[11px] text-text-tertiary hover:text-text-secondary rounded-md hover:bg-surface-3 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="w-3 h-3" />
                    {t('artifact.openInTab' as TranslationKey)}
                  </a>
                )}
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1 px-2 py-1 text-[11px] text-text-tertiary hover:text-text-secondary rounded-md hover:bg-surface-3 transition-colors cursor-pointer"
                >
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied ? t('artifact.copied' as TranslationKey) : t('artifact.copy' as TranslationKey)}
                </button>
              </div>
              <ArtifactRenderedBody artifact={artifact} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function groupByAgent(artifacts: Artifact[]): Record<string, Artifact[]> {
  const groups: Record<string, Artifact[]> = {}
  for (const a of artifacts) {
    const key = a.agentType || 'unknown'
    if (!groups[key]) groups[key] = []
    groups[key].push(a)
  }
  return groups
}

export default function ArtifactPanel() {
  const { activeWorkspaceId, workflowRunning, workspaces, activeRequirementId, executions } = useWorkspaceStore()
  const t = useT()
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [loading, setLoading] = useState(false)
  const [prevRunning, setPrevRunning] = useState(false)

  const workspace = workspaces.find((w) => w.id === activeWorkspaceId)

  useEffect(() => {
    if (!activeWorkspaceId) return
    if (prevRunning && !workflowRunning) {
      workspaceApi.listArtifacts(activeWorkspaceId)
        .then((list) => setArtifacts(Array.isArray(list) ? list : []))
        .catch(() => {})
    }
    setPrevRunning(workflowRunning)
  }, [workflowRunning, activeWorkspaceId, prevRunning])

  useEffect(() => {
    if (!activeWorkspaceId || !workflowRunning) return
    const interval = setInterval(() => {
      workspaceApi.listArtifacts(activeWorkspaceId)
        .then((list) => setArtifacts(Array.isArray(list) ? list : []))
        .catch(() => {})
    }, 8000)
    return () => clearInterval(interval)
  }, [activeWorkspaceId, workflowRunning])

  useEffect(() => {
    if (!activeWorkspaceId) return
    let cancelled = false
    setLoading(true)
    const timer = setTimeout(() => {
      workspaceApi.listArtifacts(activeWorkspaceId)
        .then((list) => { if (!cancelled) setArtifacts(Array.isArray(list) ? list : []) })
        .catch(() => { if (!cancelled) setArtifacts([]) })
        .finally(() => { if (!cancelled) setLoading(false) })
    }, 150)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [activeWorkspaceId])

  const filteredArtifacts = useMemo(() => {
    if (!activeRequirementId) return artifacts
    const reqExecIds = new Set(
      executions
        .filter(e => e.requirementId === activeRequirementId)
        .map(e => e.id),
    )
    const scoped = artifacts.filter(a => a.executionId && reqExecIds.has(a.executionId))
    return scoped.length > 0 ? scoped : artifacts
  }, [artifacts, activeRequirementId, executions])

  if (!activeWorkspaceId) return null

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
          {t('artifact.title')}
        </span>
        {activeRequirementId && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-medium">
            {t('requirement.scoped' as TranslationKey)}
          </span>
        )}
        <span className="text-[10px] text-text-tertiary font-mono">
          ({filteredArtifacts.length})
        </span>
        <div className="flex-1 h-px bg-border-subtle" />
      </div>

      {loading && (
        <div className="text-xs text-text-tertiary py-4 text-center">{t('artifact.loading' as TranslationKey)}</div>
      )}

      {!loading && filteredArtifacts.length === 0 && (
        <div className="text-xs text-text-tertiary py-4 text-center">
          {t('artifact.empty')}
        </div>
      )}

      <div className="space-y-3">
        {Object.entries(groupByAgent(filteredArtifacts)).map(([agent, arts]) => (
          <div key={agent}>
            <div className="text-[10px] font-medium text-text-tertiary uppercase tracking-wider mb-1.5 pl-1">
              {agent}
              <span className="text-text-tertiary/60 ml-1">({arts.length})</span>
            </div>
            <div className="space-y-2">
              {arts.map((art) => (
                <ArtifactCard key={art.id} artifact={art} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
