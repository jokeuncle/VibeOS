/**
 * Execution detail renderer registry.
 *
 * Each `resultType` (pipeline, code_gen, design_doc …) registers its own
 * summary line, detail panel, icon and optional quick-actions.
 * The generic `ExecutionRow` component queries this registry so that adding
 * a new task type never requires touching shared UI code.
 */

import {
  GitBranch, Code2, FileText, FlaskConical,
  Search, Boxes, Rocket, MessageSquare,
  ExternalLink, RotateCcw,
} from 'lucide-react'
import type { AgentExecution } from '../types'

type TFn = (k: any) => string

// ---------------------------------------------------------------------------
// Public protocol
// ---------------------------------------------------------------------------

export interface QuickAction {
  id: string
  label: string
  icon?: React.ReactNode
  variant?: 'primary' | 'secondary' | 'danger'
  href?: string
  visible?: boolean
  onClick?: () => void
}

export interface ExecutionRendererDef {
  icon: React.ReactNode
  iconTint?: string
  summaryLine: (payload: Record<string, unknown>, t: TFn) => string
  DetailPanel?: React.ComponentType<{ execution: AgentExecution; t: TFn }>
  quickActions?: (execution: AgentExecution, t: TFn) => QuickAction[]
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const REGISTRY = new Map<string, ExecutionRendererDef>()

export function registerExecutionRenderer(resultType: string, def: ExecutionRendererDef) {
  REGISTRY.set(resultType, def)
}

export function getExecutionRenderer(resultType: string): ExecutionRendererDef | undefined {
  return REGISTRY.get(resultType) ?? REGISTRY.get('general')
}

// ---------------------------------------------------------------------------
// Detail panel helpers
// ---------------------------------------------------------------------------

function KVRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className="flex items-baseline gap-2 text-[11px]">
      <span className="text-text-tertiary shrink-0 w-20">{label}</span>
      <span className="text-text-secondary truncate">{value}</span>
    </div>
  )
}

function LinkRow({ label, href }: { label: string; href?: string | null }) {
  if (!href) return null
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
    >
      <ExternalLink className="w-3 h-3" />
      {label}
    </a>
  )
}

// ---------------------------------------------------------------------------
// Built-in renderers
// ---------------------------------------------------------------------------

registerExecutionRenderer('pipeline', {
  icon: <GitBranch className="w-3.5 h-3.5" />,
  iconTint: 'bg-orange-500/10 text-orange-400',
  summaryLine: (p) => {
    const parts: string[] = []
    if (p.pipelineId) parts.push(`#${p.pipelineId}`)
    if (p.branch) parts.push(String(p.branch))
    return parts.join(' · ') || 'Pipeline'
  },
  DetailPanel: ({ execution }) => {
    const p = execution.resultPayload || {}
    return (
      <div className="space-y-1.5 px-3 pb-3">
        <KVRow label="Pipeline" value={p.pipelineId as string} />
        <KVRow label="Branch" value={p.branch as string} />
        <KVRow label="Project" value={p.project as string} />
        <KVRow label="Status" value={p.pipelineStatus as string} />
        <LinkRow label="View in GitLab" href={p.pipelineUrl as string} />
      </div>
    )
  },
  quickActions: (exec) => {
    const actions: QuickAction[] = []
    const url = exec.resultPayload?.pipelineUrl as string | undefined
    if (url) {
      actions.push({ id: 'open_url', label: 'GitLab', icon: <ExternalLink className="w-3 h-3" />, href: url })
    }
    if (exec.status === 'failed') {
      actions.push({ id: 'retry', label: 'Retry', icon: <RotateCcw className="w-3 h-3" />, variant: 'primary' })
    }
    return actions
  },
})

registerExecutionRenderer('code_gen', {
  icon: <Code2 className="w-3.5 h-3.5" />,
  iconTint: 'bg-blue-500/10 text-blue-400',
  summaryLine: (p) => {
    const files = p.filesCreated as number | undefined
    const lines = p.linesOfCode as number | undefined
    const parts: string[] = []
    if (files) parts.push(`${files} files`)
    if (lines) parts.push(`${lines} lines`)
    return parts.join(' · ') || 'Code generation'
  },
  DetailPanel: ({ execution }) => {
    const p = execution.resultPayload || {}
    const artifacts = (p.artifacts as string[]) || []
    return (
      <div className="space-y-1.5 px-3 pb-3">
        <KVRow label="Files" value={String(p.filesCreated ?? '')} />
        <KVRow label="Lines" value={String(p.linesOfCode ?? '')} />
        {artifacts.length > 0 && (
          <div className="space-y-0.5">
            <span className="text-[10px] text-text-tertiary uppercase tracking-wider">Artifacts</span>
            {artifacts.map((a, i) => (
              <div key={i} className="text-[11px] text-text-secondary font-mono truncate">{a}</div>
            ))}
          </div>
        )}
      </div>
    )
  },
})

registerExecutionRenderer('design_doc', {
  icon: <FileText className="w-3.5 h-3.5" />,
  iconTint: 'bg-purple-500/10 text-purple-400',
  summaryLine: (p) => (p.artifactTitle as string) || 'Design document',
})

registerExecutionRenderer('test_report', {
  icon: <FlaskConical className="w-3.5 h-3.5" />,
  iconTint: 'bg-emerald-500/10 text-emerald-400',
  summaryLine: (p) => {
    const passed = p.testsPassed as number | undefined
    const total = p.testsTotal as number | undefined
    if (passed != null && total != null) return `${passed}/${total} passed`
    return 'Test report'
  },
})

registerExecutionRenderer('requirement_analysis', {
  icon: <Search className="w-3.5 h-3.5" />,
  iconTint: 'bg-cyan-500/10 text-cyan-400',
  summaryLine: (p) => (p.summary as string) || 'Requirement analysis',
})

registerExecutionRenderer('architecture', {
  icon: <Boxes className="w-3.5 h-3.5" />,
  iconTint: 'bg-indigo-500/10 text-indigo-400',
  summaryLine: (p) => (p.artifactTitle as string) || 'Architecture design',
})

registerExecutionRenderer('deployment', {
  icon: <Rocket className="w-3.5 h-3.5" />,
  iconTint: 'bg-rose-500/10 text-rose-400',
  summaryLine: (p) => {
    const env = p.env as string | undefined
    return env ? `Deploy → ${env}` : 'Deployment'
  },
})

registerExecutionRenderer('general', {
  icon: <MessageSquare className="w-3.5 h-3.5" />,
  iconTint: 'bg-surface-3 text-text-tertiary',
  summaryLine: () => '',
})
