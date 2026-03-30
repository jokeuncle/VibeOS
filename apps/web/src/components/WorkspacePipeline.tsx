import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  GitBranch, ChevronRight, ToggleLeft, ToggleRight,
  ShieldCheck, Zap, AlertTriangle, CheckCircle2,
  ArrowRight, Settings2, Lock, Unlock,
} from 'lucide-react'
import { useT } from '../i18n'
import type { TranslationKey } from '../i18n/en'

type PhaseKey =
  | 'requirement'
  | 'architecture'
  | 'design'
  | 'development'
  | 'testing'
  | 'cicd'
  | 'monitoring'

interface PhaseConfig {
  key: PhaseKey
  labelKey: TranslationKey
  descKey: TranslationKey
  agent: string
  color: string
  dotColor: string
  enabled: boolean
  requireApproval: boolean
  qualityGate: string | null
}

const INITIAL_PHASES: PhaseConfig[] = [
  {
    key: 'requirement',
    labelKey: 'pipeline.phase.requirement.label',
    descKey: 'pipeline.phase.requirement.desc',
    agent: 'requirement-agent',
    color: 'bg-violet-500/10 border-violet-500/20 text-violet-400',
    dotColor: 'bg-violet-400',
    enabled: true,
    requireApproval: false,
    qualityGate: null,
  },
  {
    key: 'architecture',
    labelKey: 'pipeline.phase.architecture.label',
    descKey: 'pipeline.phase.architecture.desc',
    agent: 'architecture-agent',
    color: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
    dotColor: 'bg-blue-400',
    enabled: true,
    requireApproval: true,
    qualityGate: 'Schema + API spec required',
  },
  {
    key: 'design',
    labelKey: 'pipeline.phase.design.label',
    descKey: 'pipeline.phase.design.desc',
    agent: 'design-agent',
    color: 'bg-pink-500/10 border-pink-500/20 text-pink-400',
    dotColor: 'bg-pink-400',
    enabled: true,
    requireApproval: false,
    qualityGate: null,
  },
  {
    key: 'development',
    labelKey: 'pipeline.phase.development.label',
    descKey: 'pipeline.phase.development.desc',
    agent: 'dev-agent',
    color: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
    dotColor: 'bg-emerald-400',
    enabled: true,
    requireApproval: false,
    qualityGate: 'MR must be created',
  },
  {
    key: 'testing',
    labelKey: 'pipeline.phase.testing.label',
    descKey: 'pipeline.phase.testing.desc',
    agent: 'test-agent',
    color: 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400',
    dotColor: 'bg-yellow-400',
    enabled: true,
    requireApproval: false,
    qualityGate: 'Coverage ≥ 80%',
  },
  {
    key: 'cicd',
    labelKey: 'pipeline.phase.cicd.label',
    descKey: 'pipeline.phase.cicd.desc',
    agent: 'cicd-agent',
    color: 'bg-orange-500/10 border-orange-500/20 text-orange-400',
    dotColor: 'bg-orange-400',
    enabled: true,
    requireApproval: true,
    qualityGate: null,
  },
  {
    key: 'monitoring',
    labelKey: 'pipeline.phase.monitoring.label',
    descKey: 'pipeline.phase.monitoring.desc',
    agent: 'monitoring-agent',
    color: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400',
    dotColor: 'bg-cyan-400',
    enabled: false,
    requireApproval: false,
    qualityGate: null,
  },
]

function PhaseNode({ phase, isLast }: { phase: PhaseConfig; isLast: boolean }) {
  const t = useT()
  return (
    <div className="flex items-center gap-0">
      <div className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl border transition-all
        ${phase.enabled
          ? phase.color
          : 'bg-surface-2/40 border-border-subtle text-text-tertiary opacity-50'
        }`}
      >
        <div className={`w-2 h-2 rounded-full ${phase.enabled ? phase.dotColor : 'bg-text-tertiary/40'}`} />
        <span className="text-[10px] font-semibold whitespace-nowrap">{t(phase.labelKey)}</span>
        {phase.requireApproval && phase.enabled && (
          <Lock className="w-2.5 h-2.5 opacity-70" />
        )}
      </div>
      {!isLast && (
        <ArrowRight className="w-3.5 h-3.5 text-text-tertiary/40 shrink-0 mx-0.5" />
      )}
    </div>
  )
}

function PhaseRow({
  phase,
  isSelected,
  onClick,
  onToggle,
}: {
  phase: PhaseConfig
  isSelected: boolean
  onClick: () => void
  onToggle: (enabled: boolean) => void
}) {
  const t = useT()
  return (
    <motion.div
      layout
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all
        ${isSelected
          ? 'bg-surface-2 border-border-default'
          : 'bg-surface-1/30 border-border-subtle hover:bg-surface-2/60 hover:border-border-default'
        }`}
    >
      <div className={`w-2 h-2 rounded-full shrink-0 ${phase.enabled ? phase.dotColor : 'bg-text-tertiary/30'}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-[12px] font-semibold ${phase.enabled ? 'text-text-primary' : 'text-text-tertiary'}`}>
            {t(phase.labelKey)}
          </span>
          <span className="text-[10px] font-mono text-text-tertiary">{phase.agent}</span>
          {phase.requireApproval && (
            <span className="flex items-center gap-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-400 bg-amber-400/10 border border-amber-400/20 px-1.5 py-0.5 rounded-md">
              <Lock className="w-2 h-2" />
              {t('pipeline.badge.approval')}
            </span>
          )}
          {phase.qualityGate && (
            <span className="flex items-center gap-0.5 text-[9px] font-semibold uppercase tracking-wide text-accent bg-accent/10 border border-accent/20 px-1.5 py-0.5 rounded-md">
              <ShieldCheck className="w-2 h-2" />
              {t('pipeline.badge.gate')}
            </span>
          )}
        </div>
        <p className="text-[11px] text-text-tertiary mt-0.5 truncate">{t(phase.descKey)}</p>
      </div>

      <button
        onClick={e => { e.stopPropagation(); onToggle(!phase.enabled) }}
        className="shrink-0 text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer"
      >
        {phase.enabled
          ? <ToggleRight className="w-5 h-5 text-accent" />
          : <ToggleLeft className="w-5 h-5" />
        }
      </button>

      <ChevronRight className={`w-3.5 h-3.5 shrink-0 transition-transform text-text-tertiary
        ${isSelected ? 'rotate-90' : ''}`}
      />
    </motion.div>
  )
}

function PhaseDetail({ phase, onUpdate }: { phase: PhaseConfig; onUpdate: (p: Partial<PhaseConfig>) => void }) {
  const t = useT()
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.15 }}
      className="ml-4 px-4 py-4 rounded-xl border border-border-subtle bg-surface-2/40 space-y-4"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            {phase.requireApproval ? <Lock className="w-3.5 h-3.5 text-amber-400" /> : <Unlock className="w-3.5 h-3.5 text-text-tertiary" />}
            <span className="text-[12px] font-semibold text-text-primary">{t('pipeline.approval.label')}</span>
          </div>
          <p className="text-[11px] text-text-tertiary">{t('pipeline.approval.desc')}</p>
        </div>
        <button
          onClick={() => onUpdate({ requireApproval: !phase.requireApproval })}
          className="shrink-0 cursor-pointer"
        >
          {phase.requireApproval
            ? <ToggleRight className="w-5 h-5 text-amber-400" />
            : <ToggleLeft className="w-5 h-5 text-text-tertiary" />
          }
        </button>
      </div>

      <div className="h-px bg-border-subtle" />

      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <ShieldCheck className="w-3.5 h-3.5 text-accent" />
          <span className="text-[12px] font-semibold text-text-primary">{t('pipeline.qualityGate.label')}</span>
        </div>
        <input
          type="text"
          value={phase.qualityGate ?? ''}
          onChange={e => onUpdate({ qualityGate: e.target.value || null })}
          placeholder={t('pipeline.qualityGate.placeholder')}
          className="w-full px-3 py-2 rounded-lg bg-surface-3 border border-border-default text-[12px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent/50 transition-colors"
        />
      </div>

      <div className="h-px bg-border-subtle" />

      <div className="flex items-center gap-3">
        {phase.enabled
          ? <CheckCircle2 className="w-3.5 h-3.5 text-success" />
          : <AlertTriangle className="w-3.5 h-3.5 text-text-tertiary" />
        }
        <span className="text-[11px] text-text-tertiary">
          {phase.enabled
            ? (phase.requireApproval ? t('pipeline.phaseActive.requireApproval') : t('pipeline.phaseActive.autoRun'))
            : t('pipeline.phaseSkipped')
          }
        </span>
      </div>
    </motion.div>
  )
}

export default function WorkspacePipeline() {
  const t = useT()
  const [phases, setPhases] = useState<PhaseConfig[]>(INITIAL_PHASES)
  const [selectedPhase, setSelectedPhase] = useState<PhaseKey | null>(null)

  function updatePhase(key: PhaseKey, patch: Partial<PhaseConfig>) {
    setPhases(prev => prev.map(p => p.key === key ? { ...p, ...patch } : p))
  }

  const activePhases = phases.filter(p => p.enabled)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-6"
    >
      <div>
        <div className="flex items-center gap-2 mb-1">
          <GitBranch className="w-4 h-4 text-accent" />
          <h1 className="text-base font-semibold text-text-primary tracking-tight">{t('pipeline.title')}</h1>
        </div>
        <p className="text-[12px] text-text-tertiary">{t('pipeline.desc')}</p>
      </div>

      <div className="rounded-xl border border-border-subtle bg-surface-1/30 p-5">
        <div className="flex items-center gap-1 mb-3">
          <Zap className="w-3 h-3 text-text-tertiary" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">
            {t('pipeline.activeFlow')}
          </span>
          <span className="ml-auto text-[10px] font-mono text-text-tertiary">
            {activePhases.length} {t('pipeline.phases')}
          </span>
        </div>
        <div className="flex items-center flex-wrap gap-1">
          {activePhases.map((phase, i) => (
            <PhaseNode key={phase.key} phase={phase} isLast={i === activePhases.length - 1} />
          ))}
          {activePhases.length === 0 && (
            <span className="text-[11px] text-text-tertiary italic">{t('pipeline.noActivePhases')}</span>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border-subtle bg-surface-1/30 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Settings2 className="w-3.5 h-3.5 text-text-tertiary" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">
            {t('pipeline.phaseConfig')}
          </span>
        </div>
        <div className="space-y-1.5">
          {phases.map(phase => (
            <div key={phase.key}>
              <PhaseRow
                phase={phase}
                isSelected={selectedPhase === phase.key}
                onClick={() => setSelectedPhase(selectedPhase === phase.key ? null : phase.key)}
                onToggle={enabled => updatePhase(phase.key, { enabled })}
              />
              {selectedPhase === phase.key && (
                <div className="mt-1.5">
                  <PhaseDetail
                    phase={phase}
                    onUpdate={patch => updatePhase(phase.key, patch)}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-border-subtle bg-surface-1/20">
        <ShieldCheck className="w-3.5 h-3.5 text-accent mt-0.5 shrink-0" />
        <p className="text-[11px] text-text-tertiary leading-relaxed">{t('pipeline.infoNote')}</p>
      </div>
    </motion.div>
  )
}
