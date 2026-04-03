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
    <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface-1/30">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/35"
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

/** Traces sidebar status filter — must match WorkspaceTraces TraceStatus | 'all'. */
type TraceSidebarStatusFilter = 'all' | 'success' | 'error' | 'running' | 'info'

/**
 * API often omits `executionId` on artifacts. When missing, we cannot verify run status or requirement:
 * only Agent can be matched; Status ≠ all or Requirement ≠ all excludes these rows.
 */
function artifactWithoutExecutionMatchesTraceSidebar(
  a: Artifact,
  agentFilter: string,
  statusFilter: TraceSidebarStatusFilter,
  reqFilter: string,
): boolean {
  if (agentFilter !== 'All' && a.agentType !== agentFilter) return false
  if (statusFilter !== 'all') return false
  if (reqFilter !== 'all') return false
  return true
}

type ArtifactPanelProps = {
  /** When true, skip the standalone title + divider — wrap with a parent panel header (e.g. Traces). */
  embedded?: boolean
  /**
   * Traces view: keep artifacts whose executionId is in this set.
   * When omitted, no execution-based narrowing (workspace-wide list).
   */
  traceExecutionAllowlist?: Set<string>
  /**
   * When allowlist is set: also show artifacts with no executionId (e.g. filters at default on Traces).
   */
  traceShowOrphansWithoutExecution?: boolean
  /** Traces sidebar: agent chip value (`All` or AgentType key). Used when `executionId` is missing. */
  traceOrphanAgentFilter?: string
  traceOrphanStatusFilter?: TraceSidebarStatusFilter
  traceOrphanReqFilter?: string
}

export default function ArtifactPanel({
  embedded = false,
  traceExecutionAllowlist,
  traceShowOrphansWithoutExecution = false,
  traceOrphanAgentFilter,
  traceOrphanStatusFilter,
  traceOrphanReqFilter,
}: ArtifactPanelProps) {
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

  const displayArtifacts = useMemo(() => {
    if (!traceExecutionAllowlist) return filteredArtifacts
    return filteredArtifacts.filter(a => {
      if (a.executionId && traceExecutionAllowlist.has(a.executionId)) return true
      if (!a.executionId) {
        if (traceShowOrphansWithoutExecution) return true
        if (
          traceOrphanAgentFilter === undefined ||
          traceOrphanStatusFilter === undefined ||
          traceOrphanReqFilter === undefined
        )
          return false
        return artifactWithoutExecutionMatchesTraceSidebar(
          a,
          traceOrphanAgentFilter,
          traceOrphanStatusFilter,
          traceOrphanReqFilter,
        )
      }
      return false
    })
  }, [
    filteredArtifacts,
    traceExecutionAllowlist,
    traceShowOrphansWithoutExecution,
    traceOrphanAgentFilter,
    traceOrphanStatusFilter,
    traceOrphanReqFilter,
  ])

  if (!activeWorkspaceId) return null

  const noMatchesAfterTraceFilter =
    traceExecutionAllowlist != null &&
    !loading &&
    displayArtifacts.length === 0 &&
    filteredArtifacts.length > 0

  const metaRow =
    embedded && activeRequirementId ? (
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
          {t('requirement.scoped' as TranslationKey)}
        </span>
      </div>
    ) : null

  const body = (
    <>
      {embedded && metaRow}
      {loading && (
        <div className="py-8 text-center text-[12px] text-text-tertiary">
          {t('artifact.loading' as TranslationKey)}
        </div>
      )}

      {!loading && displayArtifacts.length === 0 && (
        <div className="rounded-lg border border-dashed border-border-subtle bg-surface-2/20 py-10 text-center">
          <p className="text-[12px] text-text-secondary">
            {noMatchesAfterTraceFilter
              ? t('traces.artifactsNoMatchFilters' as TranslationKey)
              : t('artifact.empty')}
          </p>
        </div>
      )}

      {!loading && displayArtifacts.length > 0 && (
        <div className="space-y-4">
          {Object.entries(groupByAgent(displayArtifacts)).map(([agent, arts]) => (
            <div key={agent}>
              <div className="mb-2 pl-0.5 text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
                {agent}
                <span className="ml-1 font-mono tabular-nums text-text-tertiary/80">({arts.length})</span>
              </div>
              <div className="space-y-2">
                {arts.map(art => (
                  <ArtifactCard key={art.id} artifact={art} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )

  if (embedded) {
    return <div className="space-y-3">{body}</div>
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wider text-text-secondary">
          {t('artifact.title')}
        </span>
        {activeRequirementId && (
          <span className="rounded-md bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">
            {t('requirement.scoped' as TranslationKey)}
          </span>
        )}
        <span className="font-mono text-[10px] tabular-nums text-text-tertiary">
          ({displayArtifacts.length})
        </span>
        <div className="min-h-px min-w-[2rem] flex-1 bg-border-subtle" />
      </div>
      {body}
    </div>
  )
}
