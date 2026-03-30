import {
  BookOpen, Network, PenSquare, Terminal, TestTube2, Server, Bell,
} from 'lucide-react'
import type { ReactNode } from 'react'
import type { PhaseType } from '../../types'

export function PhaseHintCard({ phase, t }: { phase: PhaseType; taskType?: string; t: (k: any) => string }) {
  const hints: Partial<Record<PhaseType, { icon: ReactNode; lines: string[] }>> = {
    requirement: {
      icon: <BookOpen className="w-3.5 h-3.5 text-blue-400" />,
      lines: [t('task.hint.req.line1' as any), t('task.hint.req.line2' as any), t('task.hint.req.line3' as any)],
    },
    architecture: {
      icon: <Network className="w-3.5 h-3.5 text-purple-400" />,
      lines: [t('task.hint.arch.line1' as any), t('task.hint.arch.line2' as any), t('task.hint.arch.line3' as any)],
    },
    design: {
      icon: <PenSquare className="w-3.5 h-3.5 text-pink-400" />,
      lines: [t('task.hint.design.line1' as any), t('task.hint.design.line2' as any)],
    },
    development: {
      icon: <Terminal className="w-3.5 h-3.5 text-emerald-400" />,
      lines: [t('task.hint.dev.line1' as any), t('task.hint.dev.line2' as any)],
    },
    testing: {
      icon: <TestTube2 className="w-3.5 h-3.5 text-amber-400" />,
      lines: [t('task.hint.test.line1' as any), t('task.hint.test.line2' as any)],
    },
    deployment: {
      icon: <Server className="w-3.5 h-3.5 text-cyan-400" />,
      lines: [t('task.hint.deploy.line1' as any), t('task.hint.deploy.line2' as any)],
    },
    monitoring: {
      icon: <Bell className="w-3.5 h-3.5 text-red-400" />,
      lines: [t('task.hint.mon.line1' as any), t('task.hint.mon.line2' as any)],
    },
  }
  const hint = hints[phase]
  if (!hint) return null
  return (
    <div className="rounded-lg bg-surface-2/40 border border-border-subtle p-3 space-y-1.5">
      <div className="flex items-center gap-1.5 mb-2">
        {hint.icon}
        <span className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">{t('task.hintTitle' as any)}</span>
      </div>
      {hint.lines.map((line, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="w-1 h-1 rounded-full bg-text-tertiary/40 mt-1.5 shrink-0" />
          <p className="text-[11px] text-text-tertiary leading-relaxed">{line}</p>
        </div>
      ))}
    </div>
  )
}
