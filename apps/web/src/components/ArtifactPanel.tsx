import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FileCode2, FileText, Database, Network, ChevronDown, ChevronRight, Copy, Check, Code2 } from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspace'
import { useT } from '../i18n'
import { workspaceApi } from '../lib/api'
import type { Artifact, PhaseType } from '../types'
import type { TranslationKey } from '../i18n/en'

const ICON_MAP: Record<string, typeof FileCode2> = {
  schema: Database,
  api: Network,
  code: FileCode2,
  adr: FileText,
  diagram: Network,
}

function RenderedContent({ artifact }: { artifact: Artifact }) {
  const artType = artifact.type
  const content = artifact.content || ''

  if (artType === 'adr' || artType === 'markdown') {
    return <MarkdownView text={content} />
  }

  if (artType === 'diagram' || artType === 'mermaid') {
    return (
      <div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-3 border-b border-border-subtle rounded-t-lg">
          <Network className="w-3 h-3 text-text-tertiary" />
          <span className="text-[10px] font-mono text-text-tertiary">mermaid</span>
        </div>
        <pre className="p-3 bg-surface-2/50 overflow-x-auto rounded-b-lg">
          <code className="text-[11px] font-mono text-text-primary leading-relaxed whitespace-pre">{content}</code>
        </pre>
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
      <pre className="p-3 bg-surface-2/50 overflow-x-auto rounded-b-lg max-h-80">
        <code className="text-[11px] font-mono text-text-primary leading-relaxed whitespace-pre">{content}</code>
      </pre>
    </div>
  )
}

function MarkdownView({ text }: { text: string }) {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trimStart()

    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      elements.push(
        <div key={i} className="rounded-lg border border-border-subtle overflow-hidden my-2">
          {lang && (
            <div className="flex items-center gap-2 px-3 py-1 bg-surface-3 border-b border-border-subtle">
              <Code2 className="w-3 h-3 text-text-tertiary" />
              <span className="text-[10px] font-mono text-text-tertiary">{lang}</span>
            </div>
          )}
          <pre className="p-3 bg-surface-2/50 overflow-x-auto">
            <code className="text-[11px] font-mono leading-relaxed whitespace-pre">{codeLines.join('\n')}</code>
          </pre>
        </div>
      )
      i++
      continue
    }

    if (trimmed.startsWith('### ')) {
      elements.push(<h4 key={i} className="text-xs font-bold text-text-primary mt-3 mb-1">{trimmed.slice(4)}</h4>)
    } else if (trimmed.startsWith('## ')) {
      elements.push(<h3 key={i} className="text-sm font-bold text-text-primary mt-3 mb-1">{trimmed.slice(3)}</h3>)
    } else if (trimmed.startsWith('# ')) {
      elements.push(<h2 key={i} className="text-base font-bold text-text-primary mt-4 mb-1">{trimmed.slice(2)}</h2>)
    } else if (/^[-*]\s/.test(trimmed)) {
      elements.push(
        <div key={i} className="flex gap-2 pl-2">
          <span className="text-text-tertiary shrink-0">•</span>
          <span className="text-xs text-text-primary/90 leading-relaxed">{trimmed.slice(2)}</span>
        </div>
      )
    } else if (/^\d+\.\s/.test(trimmed)) {
      const num = trimmed.match(/^(\d+)\./)?.[1]
      elements.push(
        <div key={i} className="flex gap-2 pl-2">
          <span className="text-text-tertiary shrink-0 text-xs font-mono">{num}.</span>
          <span className="text-xs text-text-primary/90 leading-relaxed">{trimmed.replace(/^\d+\.\s/, '')}</span>
        </div>
      )
    } else if (trimmed === '') {
      elements.push(<div key={i} className="h-2" />)
    } else {
      elements.push(<p key={i} className="text-xs text-text-primary/90 leading-relaxed">{trimmed}</p>)
    }
    i++
  }

  return <div className="space-y-1">{elements}</div>
}

const LANG_MAP: Record<string, string> = {
  schema: 'sql',
  api: 'yaml',
  code: 'typescript',
  adr: 'markdown',
  diagram: 'mermaid',
}

const PHASE_TYPES: PhaseType[] = ['requirement', 'design', 'architecture', 'development', 'testing', 'deployment', 'monitoring']

function ArtifactCard({ artifact }: { artifact: Artifact }) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const Icon = ICON_MAP[artifact.type] || FileText

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
                  {copied ? t('artifact.copied' as TranslationKey) : t('artifact.copy' as TranslationKey)}
                </button>
              </div>
              <RenderedContent artifact={artifact} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function ArtifactPanel() {
  const { activeWorkspaceId, workflowRunning, workspaces, activeRequirementId } = useWorkspaceStore()
  const t = useT()
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [loading, setLoading] = useState(false)
  const [prevRunning, setPrevRunning] = useState(false)
  const [phaseFilter, setPhaseFilter] = useState<string>('all')

  const workspace = workspaces.find((w) => w.id === activeWorkspaceId)

  useEffect(() => {
    if (prevRunning && !workflowRunning) {
      if (activeWorkspaceId) {
        workspaceApi.listArtifacts(activeWorkspaceId)
          .then((list) => setArtifacts(Array.isArray(list) ? list : []))
          .catch(() => {})
      }
    }
    setPrevRunning(workflowRunning)
  }, [workflowRunning, activeWorkspaceId, prevRunning])

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
    let filtered = artifacts
    if (activeRequirementId) {
      filtered = filtered.filter(a => a.requirementId === activeRequirementId)
    }
    if (phaseFilter !== 'all') {
      filtered = filtered.filter(a => a.phaseId === phaseFilter)
    }
    return filtered
  }, [artifacts, phaseFilter, activeRequirementId])

  if (!activeWorkspaceId) return null

  const phases = workspace?.phases || []

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
        {artifacts.length > 0 && (
          <select
            value={phaseFilter}
            onChange={(e) => setPhaseFilter(e.target.value)}
            className="text-[10px] px-2 py-1 rounded-md bg-surface-2 border border-border-subtle text-text-secondary outline-none cursor-pointer"
          >
            <option value="all">{t('artifact.filterAll' as TranslationKey)}</option>
            {phases.map((p) => (
              <option key={p.id} value={p.id}>{t(`phase.${p.type}` as TranslationKey)}</option>
            ))}
          </select>
        )}
      </div>

      {loading && (
        <div className="text-xs text-text-tertiary py-4 text-center">{t('artifact.loading' as TranslationKey)}</div>
      )}

      {!loading && filteredArtifacts.length === 0 && (
        <div className="text-xs text-text-tertiary py-4 text-center">
          {t('artifact.empty')}
        </div>
      )}

      <div className="space-y-2">
        {filteredArtifacts.map((art) => (
          <ArtifactCard key={art.id} artifact={art} />
        ))}
      </div>
    </div>
  )
}
