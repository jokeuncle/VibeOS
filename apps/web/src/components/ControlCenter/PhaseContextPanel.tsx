import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, FileText, ClipboardList } from 'lucide-react'
import { useGraphStore } from './useGraphStore'
import { useT } from '../../i18n'

interface PhaseResultData {
  phase_type: string
  status: string
  tasks_completed: number
  tasks_failed: number
  tasks_total: number
  artifacts: { type: string; title?: string; content?: string }[]
  decisions: string[]
  summary: string
  quality_gate: string | null
}

export default function PhaseContextPanel() {
  const t = useT()
  const executionLog = useGraphStore((s) => s.executionLog)

  const phaseResults = useMemo<PhaseResultData[]>(() => {
    const results: PhaseResultData[] = []
    for (const e of executionLog) {
      if (e.category !== 'phase' && e.category !== 'graph') continue
      if (e.action !== 'complete' && e.action !== 'node_complete') continue
      const d = e.data as Record<string, unknown>
      const result = (d.result ?? d) as Record<string, unknown>
      if (!result.phase_type && !d.phase) continue
      results.push({
        phase_type: (result.phase_type || d.phase || d.node || '') as string,
        status: (result.status || 'completed') as string,
        tasks_completed: (result.tasks_completed || 0) as number,
        tasks_failed: (result.tasks_failed || 0) as number,
        tasks_total: (result.tasks_total || 0) as number,
        artifacts: (result.artifacts || []) as PhaseResultData['artifacts'],
        decisions: (result.decisions || []) as string[],
        summary: (result.summary || '') as string,
        quality_gate: (result.quality_gate || null) as string | null,
      })
    }
    return results
  }, [executionLog])

  if (phaseResults.length === 0) {
    return (
      <div className="p-4 text-center">
        <p className="text-[11px] text-text-tertiary italic">
          {t('controlCenter.contextReview.empty')}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2 p-3">
      <div className="pb-1">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-text-tertiary/70">
          {t('controlCenter.contextReview.title')}
        </span>
      </div>
      {phaseResults.map((pr, i) => (
        <PhaseResultCard key={`${pr.phase_type}-${i}`} result={pr} />
      ))}
    </div>
  )
}

function PhaseResultCard({ result }: { result: PhaseResultData }) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)
  const Chevron = expanded ? ChevronDown : ChevronRight

  const statusColor =
    result.status === 'completed' ? 'text-emerald-400' :
    result.status === 'failed' ? 'text-red-400' :
    result.status === 'gate_failed' ? 'text-amber-400' :
    'text-text-secondary'

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-1/30 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-surface-2/35 cursor-pointer"
      >
        <Chevron className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
        <span className="text-[11px] font-semibold text-text-primary capitalize flex-1 truncate">
          {result.phase_type}
        </span>
        <span className={`text-[10px] font-medium ${statusColor}`}>
          {result.status}
        </span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-border-subtle">
          {/* Task counts */}
          <div className="flex gap-3 pt-2 text-[10px] text-text-secondary">
            <span>{result.tasks_completed}/{result.tasks_total} tasks</span>
            {result.tasks_failed > 0 && (
              <span className="text-red-400">{result.tasks_failed} failed</span>
            )}
            {result.quality_gate && (
              <span className="text-emerald-400">Gate: {result.quality_gate}</span>
            )}
          </div>

          {/* Summary */}
          {result.summary && (
            <div className="text-[11px] text-text-secondary leading-relaxed">
              {result.summary}
            </div>
          )}

          {/* Artifacts */}
          {result.artifacts.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <FileText className="w-3 h-3 text-text-tertiary" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                  {t('controlCenter.contextReview.artifacts')}
                </span>
              </div>
              <div className="space-y-1">
                {result.artifacts.map((a, j) => (
                  <div
                    key={j}
                    className="rounded-lg bg-surface-3/40 px-2.5 py-1.5 text-[10px]"
                  >
                    <span className="font-medium text-text-primary">
                      {a.title || a.type}
                    </span>
                    {a.type && a.title && (
                      <span className="ml-1.5 text-text-tertiary">({a.type})</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Decisions */}
          {result.decisions.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <ClipboardList className="w-3 h-3 text-text-tertiary" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                  {t('controlCenter.contextReview.decisions')}
                </span>
              </div>
              <ul className="space-y-0.5 pl-3">
                {result.decisions.map((d, j) => (
                  <li key={j} className="text-[10px] text-text-secondary list-disc">
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
