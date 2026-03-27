import {
  FileText, Palette, Blocks, Code2, FlaskConical, Rocket, Activity,
  PanelLeftClose, PanelLeftOpen,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { useWorkspaceStore } from '../stores/workspace'
import { useUIStore } from '../stores/ui'
import { useT } from '../i18n'
import type { PhaseType, PhaseStatus } from '../types'
import type { ReactNode } from 'react'
import type { TranslationKey } from '../i18n/en'

const PHASE_ICONS: Record<PhaseType, ReactNode> = {
  requirement: <FileText className="w-[18px] h-[18px]" />,
  design: <Palette className="w-[18px] h-[18px]" />,
  architecture: <Blocks className="w-[18px] h-[18px]" />,
  development: <Code2 className="w-[18px] h-[18px]" />,
  testing: <FlaskConical className="w-[18px] h-[18px]" />,
  deployment: <Rocket className="w-[18px] h-[18px]" />,
  monitoring: <Activity className="w-[18px] h-[18px]" />,
}

function StatusDot({ status }: { status: PhaseStatus }) {
  if (status === 'completed') return <div className="w-1.5 h-1.5 rounded-full bg-success" />
  if (status === 'in_progress') return <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-glow" />
  return <div className="w-1.5 h-1.5 rounded-full bg-surface-4" />
}

function MiniProgress({ completed, total }: { completed: number; total: number }) {
  if (total === 0) return null
  const pct = Math.round((completed / total) * 100)
  return (
    <div className="w-full px-1.5 mt-0.5">
      <div className="h-[2px] bg-surface-4 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-accent/60 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export default function Sidebar() {
  const { activeWorkspaceId, activePhaseId, workspaces, setActivePhase } = useWorkspaceStore()
  const { sidebarCollapsed, toggleSidebar } = useUIStore()
  const t = useT()

  const workspace = workspaces.find((w) => w.id === activeWorkspaceId)
  if (!workspace) return null

  return (
    <motion.aside
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0, width: sidebarCollapsed ? 40 : 68 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="border-r border-border-subtle bg-surface-1/50 flex flex-col items-center py-3 gap-1 overflow-hidden shrink-0"
    >
      <button
        onClick={toggleSidebar}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-text-tertiary hover:text-text-secondary hover:bg-surface-3 transition-all cursor-pointer mb-2"
      >
        {sidebarCollapsed ? (
          <PanelLeftOpen className="w-4 h-4" />
        ) : (
          <PanelLeftClose className="w-4 h-4" />
        )}
      </button>

      {!sidebarCollapsed && workspace.phases.map((phase, index) => {
        const isActive = activePhaseId === phase.id
        const icon = PHASE_ICONS[phase.type]
        const labelKey = `phase.short.${phase.type}` as TranslationKey
        const completed = phase.tasks.filter((t) => t.status === 'completed').length
        const total = phase.tasks.length

        return (
          <div key={phase.id} className="flex flex-col items-center w-full">
            {index > 0 && (
              <div className={`w-px h-3 mb-1 transition-colors ${
                phase.status !== 'pending' ? 'bg-accent/40' : 'bg-border-subtle'
              }`} />
            )}
            <motion.button
              onClick={() => setActivePhase(isActive ? null : phase.id)}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.95 }}
              className={`relative w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 cursor-pointer ${
                isActive ? 'bg-accent/15 text-accent glow-accent'
                  : phase.status === 'completed' ? 'text-success/70 hover:bg-surface-3'
                    : phase.status === 'in_progress' ? 'text-accent/70 hover:bg-surface-3'
                      : 'text-text-tertiary hover:bg-surface-3 hover:text-text-secondary'
              }`}
            >
              {icon}
              <div className="absolute -top-0.5 -right-0.5">
                <StatusDot status={phase.status} />
              </div>
            </motion.button>
            <span className={`text-[9px] font-mono font-medium mt-0.5 tracking-wider ${
              isActive ? 'text-accent' : 'text-text-tertiary'
            }`}>
              {t(labelKey)}
            </span>
            <MiniProgress completed={completed} total={total} />
          </div>
        )
      })}
    </motion.aside>
  )
}
