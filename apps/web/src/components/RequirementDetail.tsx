/**
 * RequirementDetail — requirement execution dashboard.
 */

import { useState, useEffect, useLayoutEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import * as Tabs from '@radix-ui/react-tabs'
import * as Dialog from '@radix-ui/react-dialog'
import * as Select from '@radix-ui/react-select'
import {
  Sparkles, RotateCcw, FileText, Palette, Blocks, Code2, FlaskConical,
  Rocket, Activity, Link2, AlertTriangle, Plus, X, Check, SkipForward,
  ChevronDown, ChevronRight, Network, Terminal, BookOpen,
  TestTube2, PackageCheck, BarChart3, PenSquare, RefreshCw,
  Layers, MessageSquare, CheckCircle2, Circle, FileCode2,
  GitBranch, Users, Target, ShieldCheck, Server, Gauge, Bell, BookMarked,
  Milestone, ScrollText, Map, Columns3, Braces, Siren, TrendingUp,
} from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspace'
import { useUIStore } from '../stores/ui'
import { useT } from '../i18n'
import { translateSeedTaskCopy } from '../lib/seedTaskI18n'
import type { PhaseType, PhaseStatus, RequirementRelation, RelationType, AgentType, Task, Artifact } from '../types'
import type { ReactNode } from 'react'
import type { TranslationKey } from '../i18n/en'

// ─── Static data ────────────────────────────────────────────────────────────────

const PHASE_ORDER: PhaseType[] = [
  'requirement', 'architecture', 'design', 'development', 'testing', 'deployment', 'monitoring',
]

const PHASE_META: Record<PhaseType, { icon: ReactNode; labelKey: TranslationKey; agentType: AgentType }> = {
  requirement:  { icon: <FileText className="w-4 h-4" />,     labelKey: 'requirement.phase.requirement',  agentType: 'requirement'  },
  architecture: { icon: <Blocks className="w-4 h-4" />,       labelKey: 'requirement.phase.architecture', agentType: 'architecture' },
  design:       { icon: <Palette className="w-4 h-4" />,      labelKey: 'requirement.phase.design',       agentType: 'design'       },
  development:  { icon: <Code2 className="w-4 h-4" />,        labelKey: 'requirement.phase.development',  agentType: 'development'  },
  testing:      { icon: <FlaskConical className="w-4 h-4" />, labelKey: 'requirement.phase.testing',      agentType: 'testing'      },
  deployment:   { icon: <Rocket className="w-4 h-4" />,       labelKey: 'requirement.phase.deployment',   agentType: 'cicd'         },
  monitoring:   { icon: <Activity className="w-4 h-4" />,     labelKey: 'requirement.phase.monitoring',   agentType: 'monitoring'   },
}

// Phase-specific task types (i18n key → translated label)
type PhaseTaskType = {
  key: string       // translation key suffix
  icon: ReactNode
  color: string
}

const PHASE_TASK_TYPE_MAP: Record<PhaseType, PhaseTaskType[]> = {
  requirement:  [
    { key: 'story',   icon: <BookOpen className="w-2.5 h-2.5" />,    color: 'bg-blue-500/15 text-blue-400 border-blue-500/20' },
    { key: 'epic',    icon: <Milestone className="w-2.5 h-2.5" />,   color: 'bg-blue-600/15 text-blue-300 border-blue-600/20' },
    { key: 'ac',      icon: <Check className="w-2.5 h-2.5" />,       color: 'bg-sky-500/15 text-sky-400 border-sky-500/20' },
  ],
  architecture: [
    { key: 'adr',     icon: <ScrollText className="w-2.5 h-2.5" />,  color: 'bg-purple-500/15 text-purple-400 border-purple-500/20' },
    { key: 'diagram', icon: <Network className="w-2.5 h-2.5" />,     color: 'bg-violet-500/15 text-violet-400 border-violet-500/20' },
    { key: 'design',  icon: <Braces className="w-2.5 h-2.5" />,      color: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/20' },
  ],
  design:       [
    { key: 'wireframe', icon: <Map className="w-2.5 h-2.5" />,       color: 'bg-pink-500/15 text-pink-400 border-pink-500/20' },
    { key: 'component', icon: <Columns3 className="w-2.5 h-2.5" />,  color: 'bg-rose-500/15 text-rose-400 border-rose-500/20' },
    { key: 'flow',      icon: <GitBranch className="w-2.5 h-2.5" />, color: 'bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/20' },
    { key: 'style',     icon: <PenSquare className="w-2.5 h-2.5" />, color: 'bg-purple-400/15 text-purple-300 border-purple-400/20' },
  ],
  development:  [
    { key: 'feature',  icon: <Sparkles className="w-2.5 h-2.5" />,   color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' },
    { key: 'fix',      icon: <ShieldCheck className="w-2.5 h-2.5" />, color: 'bg-red-500/15 text-red-400 border-red-500/20' },
    { key: 'refactor', icon: <RefreshCw className="w-2.5 h-2.5" />,  color: 'bg-teal-500/15 text-teal-400 border-teal-500/20' },
    { key: 'config',   icon: <Terminal className="w-2.5 h-2.5" />,   color: 'bg-green-600/15 text-green-400 border-green-600/20' },
  ],
  testing:      [
    { key: 'unit',        icon: <TestTube2 className="w-2.5 h-2.5" />,  color: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
    { key: 'integration', icon: <Layers className="w-2.5 h-2.5" />,     color: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20' },
    { key: 'e2e',         icon: <Target className="w-2.5 h-2.5" />,     color: 'bg-orange-500/15 text-orange-400 border-orange-500/20' },
    { key: 'perf',        icon: <Gauge className="w-2.5 h-2.5" />,      color: 'bg-amber-600/15 text-amber-300 border-amber-600/20' },
  ],
  deployment:   [
    { key: 'staging',    icon: <Server className="w-2.5 h-2.5" />,      color: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20' },
    { key: 'production', icon: <Rocket className="w-2.5 h-2.5" />,      color: 'bg-sky-600/15 text-sky-300 border-sky-600/20' },
    { key: 'preview',    icon: <Target className="w-2.5 h-2.5" />,      color: 'bg-teal-500/15 text-teal-400 border-teal-500/20' },
    { key: 'rollback',   icon: <RotateCcw className="w-2.5 h-2.5" />,   color: 'bg-slate-500/15 text-slate-400 border-slate-500/20' },
  ],
  monitoring:   [
    { key: 'alert',     icon: <Bell className="w-2.5 h-2.5" />,         color: 'bg-red-500/15 text-red-400 border-red-500/20' },
    { key: 'metric',    icon: <TrendingUp className="w-2.5 h-2.5" />,   color: 'bg-orange-500/15 text-orange-400 border-orange-500/20' },
    { key: 'dashboard', icon: <BarChart3 className="w-2.5 h-2.5" />,   color: 'bg-rose-500/15 text-rose-400 border-rose-500/20' },
    { key: 'incident',  icon: <Siren className="w-2.5 h-2.5" />,       color: 'bg-red-600/15 text-red-300 border-red-600/20' },
  ],
}

function getTaskTypeInfo(phase: PhaseType, task: Task): PhaseTaskType {
  const types = PHASE_TASK_TYPE_MAP[phase]
  const seed = Math.abs((task.title.charCodeAt(0) || 0) + (task.title.charCodeAt(2) || 0) + task.title.length)
  return types[seed % types.length]
}

// ─── Suggested tasks per phase ───────────────────────────────────────────────────

const PHASE_SUGGESTED_TASKS: Record<PhaseType, { labelKey: string; icon: ReactNode }[]> = {
  requirement: [
    { labelKey: 'task.suggest.req.userStory',    icon: <BookOpen className="w-3 h-3" /> },
    { labelKey: 'task.suggest.req.ac',           icon: <Check className="w-3 h-3" /> },
    { labelKey: 'task.suggest.req.journey',      icon: <Map className="w-3 h-3" /> },
    { labelKey: 'task.suggest.req.stakeholder',  icon: <Users className="w-3 h-3" /> },
    { labelKey: 'task.suggest.req.competitive',  icon: <Target className="w-3 h-3" /> },
  ],
  architecture: [
    { labelKey: 'task.suggest.arch.techStack',   icon: <Braces className="w-3 h-3" /> },
    { labelKey: 'task.suggest.arch.sysDesign',   icon: <Network className="w-3 h-3" /> },
    { labelKey: 'task.suggest.arch.database',    icon: <Layers className="w-3 h-3" /> },
    { labelKey: 'task.suggest.arch.api',         icon: <Columns3 className="w-3 h-3" /> },
    { labelKey: 'task.suggest.arch.security',    icon: <ShieldCheck className="w-3 h-3" /> },
    { labelKey: 'task.suggest.arch.nfr',         icon: <ScrollText className="w-3 h-3" /> },
  ],
  design: [
    { labelKey: 'task.suggest.design.wireframe', icon: <Map className="w-3 h-3" /> },
    { labelKey: 'task.suggest.design.hifi',      icon: <PenSquare className="w-3 h-3" /> },
    { labelKey: 'task.suggest.design.prototype', icon: <GitBranch className="w-3 h-3" /> },
    { labelKey: 'task.suggest.design.ds',        icon: <Columns3 className="w-3 h-3" /> },
    { labelKey: 'task.suggest.design.a11y',      icon: <ShieldCheck className="w-3 h-3" /> },
  ],
  development: [
    { labelKey: 'task.suggest.dev.frontend',     icon: <Code2 className="w-3 h-3" /> },
    { labelKey: 'task.suggest.dev.backend',      icon: <Server className="w-3 h-3" /> },
    { labelKey: 'task.suggest.dev.migration',    icon: <Layers className="w-3 h-3" /> },
    { labelKey: 'task.suggest.dev.unitTest',     icon: <TestTube2 className="w-3 h-3" /> },
    { labelKey: 'task.suggest.dev.review',       icon: <CheckCircle2 className="w-3 h-3" /> },
    { labelKey: 'task.suggest.dev.docs',         icon: <BookMarked className="w-3 h-3" /> },
  ],
  testing: [
    { labelKey: 'task.suggest.test.unit',        icon: <TestTube2 className="w-3 h-3" /> },
    { labelKey: 'task.suggest.test.integration', icon: <Layers className="w-3 h-3" /> },
    { labelKey: 'task.suggest.test.e2e',         icon: <Target className="w-3 h-3" /> },
    { labelKey: 'task.suggest.test.perf',        icon: <Gauge className="w-3 h-3" /> },
    { labelKey: 'task.suggest.test.security',    icon: <ShieldCheck className="w-3 h-3" /> },
    { labelKey: 'task.suggest.test.regression',  icon: <RefreshCw className="w-3 h-3" /> },
  ],
  deployment: [
    { labelKey: 'task.suggest.deploy.staging',   icon: <Server className="w-3 h-3" /> },
    { labelKey: 'task.suggest.deploy.prod',      icon: <Rocket className="w-3 h-3" /> },
    { labelKey: 'task.suggest.deploy.migration', icon: <Layers className="w-3 h-3" /> },
    { labelKey: 'task.suggest.deploy.monitor',   icon: <Activity className="w-3 h-3" /> },
    { labelKey: 'task.suggest.deploy.rollback',  icon: <RotateCcw className="w-3 h-3" /> },
  ],
  monitoring: [
    { labelKey: 'task.suggest.mon.errorRate',    icon: <Siren className="w-3 h-3" /> },
    { labelKey: 'task.suggest.mon.latency',      icon: <Gauge className="w-3 h-3" /> },
    { labelKey: 'task.suggest.mon.resource',     icon: <Server className="w-3 h-3" /> },
    { labelKey: 'task.suggest.mon.dashboard',    icon: <BarChart3 className="w-3 h-3" /> },
    { labelKey: 'task.suggest.mon.slo',          icon: <Target className="w-3 h-3" /> },
    { labelKey: 'task.suggest.mon.runbook',      icon: <BookMarked className="w-3 h-3" /> },
  ],
}

// ─── Phase-specific drawer content ───────────────────────────────────────────────

type DrawerSection = { label: string; value: string; mono?: boolean }

function getPhaseDrawerSections(phase: PhaseType, task: Task, t: (k: any) => string): DrawerSection[] {
  const typeInfo = getTaskTypeInfo(phase, task)
  const typeLabel = t(`task.type.${typeInfo.key}` as any)

  const base: DrawerSection[] = [
    { label: t('task.type.label' as any), value: typeLabel },
  ]
  if (task.assignedAgent) {
    base.push({ label: t('task.assignedAgent'), value: t(`agent.name.${task.assignedAgent}` as any) })
  }

  return base
}

// Phase-specific checklist items
const PHASE_CHECKLIST: Record<PhaseType, string[]> = {
  requirement:  ['task.check.req.roleGoalBenefit', 'task.check.req.ac', 'task.check.req.priority', 'task.check.req.estimation'],
  architecture: ['task.check.arch.context', 'task.check.arch.decision', 'task.check.arch.consequences', 'task.check.arch.reviewed'],
  design:       ['task.check.design.wireframe', 'task.check.design.hifi', 'task.check.design.reviewed', 'task.check.design.handoff'],
  development:  ['task.check.dev.impl', 'task.check.dev.unitTest', 'task.check.dev.reviewed', 'task.check.dev.docs'],
  testing:      ['task.check.test.written', 'task.check.test.passed', 'task.check.test.coverage', 'task.check.test.edgeCases'],
  deployment:   ['task.check.deploy.stagingOk', 'task.check.deploy.prodOk', 'task.check.deploy.rollback', 'task.check.deploy.notified'],
  monitoring:   ['task.check.mon.alert', 'task.check.mon.dashboard', 'task.check.mon.runbook', 'task.check.mon.sloSet'],
}

// ─── Phase empty state icons ─────────────────────────────────────────────────────

const PHASE_EMPTY_ICON: Record<PhaseType, ReactNode> = {
  requirement:  <FileText className="w-8 h-8" />,
  architecture: <Blocks className="w-8 h-8" />,
  design:       <Palette className="w-8 h-8" />,
  development:  <Code2 className="w-8 h-8" />,
  testing:      <FlaskConical className="w-8 h-8" />,
  deployment:   <Rocket className="w-8 h-8" />,
  monitoring:   <BarChart3 className="w-8 h-8" />,
}

// ─── Helpers ─────────────────────────────────────────────────────────────────────

type PhaseDisplayStatus = 'pending' | 'active' | 'idle' | 'completed' | 'rework'

const PHASE_STATUS_UI: Record<PhaseDisplayStatus, { dot: string; label: TranslationKey; labelColor: string }> = {
  pending:   { dot: 'bg-surface-4',            label: 'phase.status.pending',   labelColor: 'text-text-tertiary' },
  active:    { dot: 'bg-accent animate-pulse',  label: 'phase.status.active',    labelColor: 'text-accent' },
  idle:      { dot: 'bg-warning',              label: 'phase.status.idle',      labelColor: 'text-warning' },
  completed: { dot: 'bg-success',              label: 'phase.status.completed', labelColor: 'text-success' },
  rework:    { dot: 'bg-warning animate-pulse', label: 'phase.status.rework',    labelColor: 'text-warning' },
}

const PRIORITY_COLORS: Record<string, string> = {
  p0: 'bg-danger/10 text-danger border border-danger/20',
  p1: 'bg-warning/10 text-warning border border-warning/20',
  p2: 'bg-accent/10 text-accent border border-accent/20',
  p3: 'bg-surface-3 text-text-tertiary border border-border-subtle',
}

const TASK_STATUS_PILL: Record<PhaseStatus, string> = {
  pending: 'bg-surface-3 text-text-tertiary',
  in_progress: 'bg-accent/15 text-accent',
  completed: 'bg-success/15 text-success',
}

const STATUS_COLORS: Record<string, string> = {
  draft:       'bg-surface-4 text-text-secondary',
  in_progress: 'bg-accent/20 text-accent',
  completed:   'bg-success/20 text-success',
}

const RELATION_TYPES: { value: RelationType; labelKey: string }[] = [
  { value: 'depends_on',     labelKey: 'requirement.relation.depends_on' },
  { value: 'parent_of',      labelKey: 'requirement.relation.parent_of' },
  { value: 'related_to',     labelKey: 'requirement.relation.related_to' },
  { value: 'evolves_from',   labelKey: 'requirement.relation.evolves_from' },
  { value: 'conflicts_with', labelKey: 'requirement.relation.conflicts_with' },
]

function getPhaseDisplayStatus(
  phaseType: PhaseType, currentPhase: PhaseType, tasks: Task[], iteration: number,
): PhaseDisplayStatus {
  const phaseIdx   = PHASE_ORDER.indexOf(phaseType)
  const currentIdx = PHASE_ORDER.indexOf(currentPhase)
  if (phaseIdx > currentIdx) return 'pending'
  const hasInProgress = tasks.some(t => t.status === 'in_progress')
  const allDone       = tasks.length > 0 && tasks.every(t => t.status === 'completed')
  if (phaseIdx < currentIdx) return 'completed'
  if (hasInProgress) return 'active'
  if (allDone && iteration > 1) return 'rework'
  if (allDone) return 'completed'
  return 'idle'
}

// ─── Phase Matrix Card ───────────────────────────────────────────────────────────

function PhaseMatrixCard({ phaseType, tasks, artifacts, currentPhase, iteration, isSelected, onClick, t }: {
  phaseType: PhaseType; tasks: Task[]; artifacts: Artifact[]; currentPhase: PhaseType
  iteration: number; isSelected: boolean; onClick: () => void; t: (k: any) => string
}) {
  const meta     = PHASE_META[phaseType]
  const status   = getPhaseDisplayStatus(phaseType, currentPhase, tasks, iteration)
  const statusUi = PHASE_STATUS_UI[status]
  const done = tasks.filter(t2 => t2.status === 'completed').length

  const cardClass = isSelected
    ? 'bg-accent/[0.07] border-accent/40 shadow-sm'
    : {
        active:    'bg-surface-2/40 border-accent/25 hover:border-accent/35',
        idle:      'bg-surface-2/40 border-warning/20 hover:border-border-default',
        completed: 'bg-surface-2/40 border-border-subtle hover:border-border-default',
        rework:    'bg-surface-2/40 border-warning/25 hover:border-border-default',
        pending:   'bg-surface-2/25 border-border-subtle hover:border-border-default',
      }[status]

  const iconColor = isSelected ? 'text-accent' : status === 'active' ? 'text-accent' : status === 'completed' ? 'text-success' : status === 'pending' ? 'text-text-tertiary' : 'text-text-secondary'

  return (
    <button type="button" onClick={onClick} className={`relative text-left p-2.5 rounded-lg border transition-all cursor-pointer ${cardClass}`}>
      <div className="flex items-center gap-1 mb-1.5">
        <span className={`shrink-0 ${iconColor}`}>{meta.icon}</span>
        <span className={`text-[10px] font-semibold truncate ${isSelected ? 'text-accent' : status === 'pending' ? 'text-text-tertiary' : 'text-text-secondary'}`}>
          {t(meta.labelKey)}
        </span>
        {isSelected && <MessageSquare className="w-2.5 h-2.5 text-accent ml-auto shrink-0" />}
        {!isSelected && iteration > 1 && phaseType === currentPhase && (
          <span className="ml-auto flex items-center gap-0.5 text-[9px] font-bold text-warning bg-warning/10 px-1 py-0.5 rounded-full">
            <RefreshCw className="w-2 h-2" />×{iteration}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 mb-1.5">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusUi.dot}`} />
        <span className={`text-[9px] font-medium ${statusUi.labelColor}`}>{t(statusUi.label)}</span>
        <span className="ml-auto text-[9px] font-mono text-text-tertiary">
          {tasks.length > 0 ? `${done}/${tasks.length}` : '—'}
        </span>
      </div>
      {!isSelected && artifacts.length > 0 && (
        <div className="absolute top-2.5 right-2.5 flex items-center gap-0.5 text-[9px] text-text-tertiary">
          <FileText className="w-2.5 h-2.5" />{artifacts.length}
        </div>
      )}
    </button>
  )
}

// ─── Task Drawer ──────────────────────────────────────────────────────────────────

function TaskDrawer({ task, phase, artifacts, open, onClose, t }: {
  task: Task | null; phase: PhaseType; artifacts: Artifact[]
  open: boolean; onClose: () => void; t: (k: any) => string
}) {
  if (!task) return null

  const taskCopy = translateSeedTaskCopy(task.title, task.description, t)
  const typeInfo = getTaskTypeInfo(phase, task)
  const typeLabel = t(`task.type.${typeInfo.key}` as any)
  const linkedArtifacts = artifacts.filter(a => a.taskId === task.id)
  const checklist = PHASE_CHECKLIST[phase]
  const sections = getPhaseDrawerSections(phase, task, t)

  const statusConfig = task.status === 'completed'
    ? { icon: <CheckCircle2 className="w-4 h-4 text-success" />, cls: 'bg-success/15 text-success' }
    : task.status === 'in_progress'
    ? { icon: <span className="w-4 h-4 rounded-full border-2 border-accent border-t-transparent animate-spin inline-block" />, cls: 'bg-accent/15 text-accent' }
    : { icon: <Circle className="w-4 h-4 text-text-tertiary/50" />, cls: 'bg-surface-3 text-text-tertiary' }

  return (
    <Dialog.Root open={open} onOpenChange={v => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/25 backdrop-blur-[2px] z-[100]" />
        <Dialog.Content
          className="fixed right-0 top-0 h-full w-[440px] max-w-[94vw] bg-surface-1 border-l border-border-default shadow-2xl z-[101] flex flex-col outline-none"
          aria-describedby={undefined}
        >
          {/* ── Header ── */}
          <div className="flex items-start gap-3 px-5 pt-5 pb-4 border-b border-border-subtle bg-surface-2/40">
            <div className="mt-0.5 shrink-0">{statusConfig.icon}</div>
            <div className="flex-1 min-w-0">
              <Dialog.Title className="text-sm font-semibold text-text-primary leading-snug mb-2">
                {taskCopy.title}
              </Dialog.Title>
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* Phase-specific type badge */}
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-md border ${typeInfo.color}`}>
                  {typeInfo.icon}
                  {typeLabel}
                </span>
                {task.priority && (
                  <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded uppercase ${PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.p3}`}>
                    {task.priority}
                  </span>
                )}
                <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${statusConfig.cls}`}>
                  {t(`task.status.${task.status}` as any)}
                </span>
              </div>
            </div>
            <Dialog.Close asChild>
              <button className="p-1.5 rounded-lg hover:bg-surface-3 text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer shrink-0 mt-0.5">
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </div>

          {/* ── Tabs ── */}
          <Tabs.Root defaultValue="detail" className="flex-1 flex flex-col overflow-hidden">
            <Tabs.List className="flex border-b border-border-subtle px-5 bg-surface-1/30 shrink-0">
              {([
                { id: 'detail',    icon: <FileText className="w-3 h-3" />,      label: t('task.detail') },
                { id: 'checklist', icon: <CheckCircle2 className="w-3 h-3" />,  label: t('task.checklist' as any) },
                { id: 'artifacts', icon: <FileCode2 className="w-3 h-3" />,     label: t('phase.tab.artifacts') },
              ] as const).map(tab => (
                <Tabs.Trigger
                  key={tab.id}
                  value={tab.id}
                  className="flex items-center gap-1.5 px-3 py-2.5 text-[11px] font-medium border-b-2 -mb-px transition-colors cursor-pointer outline-none text-text-tertiary border-transparent hover:text-text-secondary data-[state=active]:text-accent data-[state=active]:border-accent"
                >
                  {tab.icon}{tab.label}
                  {tab.id === 'artifacts' && linkedArtifacts.length > 0 && (
                    <span className="text-[10px] font-mono opacity-60">({linkedArtifacts.length})</span>
                  )}
                </Tabs.Trigger>
              ))}
            </Tabs.List>

            <div className="flex-1 overflow-y-auto">

              {/* ── Detail tab ── */}
              <Tabs.Content value="detail" className="p-5 space-y-5 outline-none">
                {/* Phase-specific metadata */}
                {sections.length > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    {sections.map((s, i) => (
                      <div key={i} className="bg-surface-2/40 rounded-lg px-3 py-2 border border-border-subtle">
                        <p className="text-[9px] font-semibold text-text-secondary uppercase tracking-wider mb-1">{s.label}</p>
                        <p className={`text-xs font-medium text-text-primary ${s.mono ? 'font-mono' : ''}`}>{s.value}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Description */}
                <div>
                  <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider mb-2">{t('task.description')}</p>
                  {taskCopy.description ? (
                    <div className="text-xs text-text-secondary leading-relaxed bg-surface-2/40 rounded-lg p-3.5 border border-border-subtle whitespace-pre-wrap">
                      {taskCopy.description}
                    </div>
                  ) : (
                    <div className="py-6 text-center rounded-lg border border-dashed border-border-subtle bg-surface-2/30">
                      <MessageSquare className="w-5 h-5 mx-auto mb-2 text-text-tertiary/40" />
                      <p className="text-xs text-text-tertiary">{t('task.descriptionPlaceholder')}</p>
                    </div>
                  )}
                </div>

                {/* Phase-specific hint card */}
                <PhaseHintCard phase={phase} taskType={typeInfo.key} t={t} />
              </Tabs.Content>

              {/* ── Checklist tab ── */}
              <Tabs.Content value="checklist" className="p-5 outline-none">
                <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider mb-3">{t('task.doneWhen' as any)}</p>
                <div className="space-y-2">
                  {checklist.map((key, i) => {
                    const isDone = task.status === 'completed'
                    return (
                      <div key={i} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
                        isDone ? 'bg-success/5 border-success/20' : 'bg-surface-2/40 border-border-subtle'
                      }`}>
                        {isDone
                          ? <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                          : <Circle className="w-4 h-4 text-text-tertiary/30 shrink-0" />
                        }
                        <span className={`text-xs ${isDone ? 'text-text-secondary line-through' : 'text-text-primary'}`}>
                          {t(key as any)}
                        </span>
                      </div>
                    )
                  })}
                </div>
                <p className="text-[10px] text-text-tertiary/60 mt-4 text-center">{t('task.checklistHint' as any)}</p>
              </Tabs.Content>

              {/* ── Artifacts tab ── */}
              <Tabs.Content value="artifacts" className="p-5 space-y-2 outline-none">
                {linkedArtifacts.length === 0 ? (
                  <div className="py-12 text-center">
                    <FileCode2 className="w-8 h-8 mx-auto mb-3 text-text-tertiary/25" />
                    <p className="text-xs text-text-tertiary">{t('phase.noArtifacts')}</p>
                    <p className="text-[11px] text-text-tertiary/50 mt-1">{t('task.artifactsHint' as any)}</p>
                  </div>
                ) : (
                  linkedArtifacts.map(art => (
                    <details key={art.id} className="group bg-surface-2/40 rounded-lg border border-border-subtle overflow-hidden">
                      <summary className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer list-none hover:bg-surface-3/50 transition-colors">
                        <div className="w-6 h-6 rounded bg-accent/10 flex items-center justify-center shrink-0">
                          <FileText className="w-3 h-3 text-accent" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-medium text-text-primary block truncate">{art.title}</span>
                          <span className="text-[10px] text-text-tertiary font-mono">{art.type} · v{art.version}</span>
                        </div>
                        <ChevronDown className="w-3 h-3 text-text-tertiary shrink-0 transition-transform group-open:rotate-180" />
                      </summary>
                      <div className="px-3 pb-3 pt-2 border-t border-border-subtle">
                        <pre className="text-[11px] text-text-secondary whitespace-pre-wrap max-h-64 overflow-auto leading-relaxed font-mono">
                          {art.content}
                        </pre>
                      </div>
                    </details>
                  ))
                )}
              </Tabs.Content>
            </div>
          </Tabs.Root>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// ─── Phase-specific hint card ─────────────────────────────────────────────────────

function PhaseHintCard({ phase, taskType, t }: { phase: PhaseType; taskType: string; t: (k: any) => string }) {
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

// ─── Phase Task Row ───────────────────────────────────────────────────────────────

function PhaseTaskRow({ task, phase, onClick, t }: {
  task: Task; phase: PhaseType; onClick: () => void; t: (k: any) => string
}) {
  const taskCopy = translateSeedTaskCopy(task.title, task.description, t as (k: TranslationKey) => string)
  const typeInfo = getTaskTypeInfo(phase, task)
  const typeLabel = t(`task.type.${typeInfo.key}` as any)

  const avatarClass = task.status === 'completed'
    ? 'bg-success/10 text-success'
    : task.status === 'in_progress'
      ? 'bg-accent/10 text-accent'
      : 'bg-surface-3 text-text-tertiary'

  const avatarIcon = task.status === 'completed' ? (
    <CheckCircle2 className="w-3.5 h-3.5" />
  ) : task.status === 'in_progress' ? (
    <span className="w-3.5 h-3.5 rounded-full border-2 border-accent border-t-transparent animate-spin inline-block" />
  ) : (
    <Circle className="w-3.5 h-3.5 text-text-tertiary/50" />
  )

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex gap-2.5 group cursor-pointer rounded-lg -mx-1 px-1 py-1.5 hover:bg-surface-2/35 transition-colors text-left"
    >
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${avatarClass}`}>
        {avatarIcon}
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-md border shrink-0 ${typeInfo.color}`}>
                {typeInfo.icon}
                {typeLabel}
              </span>
              <span className={`px-1.5 py-0.5 text-[9px] font-medium rounded-md shrink-0 ${TASK_STATUS_PILL[task.status]}`}>
                {t(`task.status.${task.status}` as any)}
              </span>
              {task.priority && (
                <span className={`px-1.5 py-0.5 text-[9px] font-semibold rounded-md uppercase shrink-0 ${PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.p3}`}>
                  {task.priority}
                </span>
              )}
            </div>
            <p className="text-xs text-text-primary/90 font-medium leading-relaxed">{taskCopy.title}</p>
            {taskCopy.description && (
              <p className="text-xs text-text-tertiary line-clamp-2 leading-relaxed">{taskCopy.description}</p>
            )}
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-text-tertiary shrink-0 mt-1 opacity-0 group-hover:opacity-60 transition-opacity" />
        </div>
      </div>
    </button>
  )
}

// ─── Suggested Tasks empty state ──────────────────────────────────────────────────

function SuggestedTasksEmpty({ phase, reqTitle, sendNLP, t }: {
  phase: PhaseType; reqTitle: string
  sendNLP: (msg: string) => void; t: (k: any) => string
}) {
  const suggestions = PHASE_SUGGESTED_TASKS[phase]
  const phaseLabel  = t(PHASE_META[phase].labelKey)

  return (
    <div className="rounded-lg border border-dashed border-border-subtle/90 overflow-hidden bg-surface-2/15">
      {/* Icon + empty message */}
      <div className="py-6 text-center px-4 border-b border-border-subtle/50">
        <div className="w-10 h-10 rounded-xl bg-surface-2/80 border border-border-subtle flex items-center justify-center mx-auto mb-3 text-text-tertiary/50 [&_svg]:w-7 [&_svg]:h-7">
          {PHASE_EMPTY_ICON[phase]}
        </div>
        <p className="text-xs text-text-tertiary font-medium">{t('requirement.noTasks' as any)}</p>
        <p className="text-[11px] text-text-tertiary/50 mt-1">{t('phase.suggestHint' as any)}</p>
      </div>

      {/* Suggested tasks grid */}
      <div className="p-3">
        <p className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-2 px-1">{t('task.suggested' as any)}</p>
        <div className="grid grid-cols-2 gap-1.5">
          {suggestions.map((sug, i) => (
            <button
              key={i}
              onClick={() => sendNLP(`请为需求「${reqTitle}」的${phaseLabel}阶段创建以下任务：${t(sug.labelKey as any)}`)}
              className="flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-surface-2/40 border border-transparent hover:border-border-subtle transition-all cursor-pointer text-left group"
            >
              <span className="text-text-tertiary/60 group-hover:text-accent transition-colors shrink-0">{sug.icon}</span>
              <span className="text-[11px] text-text-secondary group-hover:text-text-primary transition-colors truncate leading-tight">
                {t(sug.labelKey as any)}
              </span>
              <Plus className="w-3 h-3 text-text-tertiary/30 group-hover:text-accent ml-auto shrink-0 transition-colors" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Radix Select ─────────────────────────────────────────────────────────────────

function StyledSelect({ value, onValueChange, placeholder, children }: {
  value: string; onValueChange: (v: string) => void; placeholder?: string; children: ReactNode
}) {
  return (
    <Select.Root value={value} onValueChange={onValueChange}>
      <Select.Trigger className="flex items-center gap-1.5 bg-surface-3 border border-border-subtle rounded-lg px-2.5 py-1.5 text-xs text-text-primary cursor-pointer hover:border-border-default outline-none data-[state=open]:border-accent transition-colors w-full">
        <Select.Value placeholder={placeholder} />
        <Select.Icon className="ml-auto"><ChevronDown className="w-3 h-3 text-text-tertiary" /></Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content position="popper" sideOffset={4} className="bg-surface-2 border border-border-default rounded-lg shadow-xl z-[200] overflow-hidden min-w-[160px] max-w-[280px]">
          <Select.Viewport className="p-1">{children}</Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  )
}

function SelectItem({ value, children }: { value: string; children: ReactNode }) {
  return (
    <Select.Item value={value} className="flex items-center px-3 py-1.5 text-xs text-text-primary rounded cursor-pointer outline-none data-[highlighted]:bg-surface-3 data-[state=checked]:text-accent">
      <Select.ItemText>{children}</Select.ItemText>
    </Select.Item>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────────

export default function RequirementDetail() {
  const t = useT()
  const { workspaces, activeWorkspaceId, requirementDetail, resetRequirementPhase, workflowRunning, sendNLPMessageStream } = useWorkspaceStore()
  const { addToast, setNlpContext } = useUIStore()

  const req = requirementDetail
  const workspace = workspaces.find(w => w.id === activeWorkspaceId)

  const [selectedPhase, setSelectedPhase] = useState<PhaseType>(() => req?.currentPhase ?? 'requirement')
  const [showRelations, setShowRelations] = useState(false)
  const [addingRelation, setAddingRelation] = useState(false)
  const [newRelTarget, setNewRelTarget] = useState('')
  const [newRelType, setNewRelType] = useState<RelationType>('depends_on')
  const [drawerTask, setDrawerTask] = useState<Task | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [descExpanded, setDescExpanded] = useState(false)

  useLayoutEffect(() => {
    if (!req) return
    setSelectedPhase(req.currentPhase)
    setDrawerTask(null)
    setDescExpanded(false)
  }, [req?.id])

  useEffect(() => {
    if (!req) return
    setNlpContext({
      requirementId: req.id,
      requirementTitle: req.title,
      phaseType: selectedPhase,
      agentType: PHASE_META[selectedPhase]?.agentType ?? null,
    })
    return () => setNlpContext(null)
  }, [req?.id, selectedPhase, setNlpContext])

  if (!req) return null

  const tasks     = req.tasks     || []
  const artifacts = req.artifacts || []
  const relations = req.relations || []
  const iteration = Number(req.iteration) || 1
  const otherReqs = (workspace?.requirements || []).filter(r => r.id !== req.id)

  const getTasksForPhase = (ph: PhaseType) => tasks.filter(t2 => workspace?.phases.find(p => p.id === t2.phaseId)?.type === ph)
  const getArtsForPhase  = (ph: PhaseType) => artifacts.filter(a => workspace?.phases.find(p => p.id === a.phaseId)?.type === ph)

  const selectedPhaseTasks = getTasksForPhase(selectedPhase)
  const phaseDone = selectedPhaseTasks.filter(t2 => t2.status === 'completed').length

  const currentPhaseTasks = getTasksForPhase(req.currentPhase)
  const allCurrentDone    = currentPhaseTasks.length > 0 && currentPhaseTasks.every(t2 => t2.status === 'completed')
  const currentOrderIdx   = PHASE_ORDER.indexOf(req.currentPhase)
  const nextPhaseType     = currentOrderIdx < PHASE_ORDER.length - 1 ? PHASE_ORDER[currentOrderIdx + 1] : null
  const meta = PHASE_META[selectedPhase]

  const handleAISummary = () => {
    if (!activeWorkspaceId || summaryLoading) return
    setSummaryLoading(true)
    sendNLPMessageStream(`请对需求「${req.title}」当前的进展做一个简洁的 AI 总结，包括：\n1. 当前所在阶段（${t(PHASE_META[req.currentPhase].labelKey)}）的完成情况\n2. 各阶段任务完成率\n3. 下一步建议操作`)
    setTimeout(() => setSummaryLoading(false), 2000)
  }

  const handleAdvancePhase = async () => {
    if (!activeWorkspaceId || !nextPhaseType) return
    try {
      const { workspaceApi } = await import('../lib/api')
      await workspaceApi.updateRequirement(activeWorkspaceId, req.id, { currentPhase: nextPhaseType })
      const { useWorkspaceStore: gs } = await import('../stores/workspace')
      gs.getState().loadRequirementDetail(activeWorkspaceId, req.id)
      gs.getState().refreshActiveWorkspace()
      setSelectedPhase(nextPhaseType)
    } catch { addToast({ type: 'error', message: 'Failed to advance phase' }) }
  }

  const handleAddRelation = async () => {
    if (!activeWorkspaceId || !newRelTarget) return
    try {
      const { workspaceApi } = await import('../lib/api')
      await workspaceApi.addRequirementRelation(activeWorkspaceId, req.id, { targetId: newRelTarget, relationType: newRelType })
      setAddingRelation(false); setNewRelTarget('')
      const { useWorkspaceStore: gs } = await import('../stores/workspace')
      gs.getState().loadRequirementDetail(activeWorkspaceId, req.id)
    } catch { addToast({ type: 'error', message: 'Failed to add relation' }) }
  }

  const handleRemoveRelation = async (rel: RequirementRelation) => {
    if (!activeWorkspaceId) return
    try {
      const { workspaceApi } = await import('../lib/api')
      await workspaceApi.removeRequirementRelation(activeWorkspaceId, req.id, rel.id)
      const { useWorkspaceStore: gs } = await import('../stores/workspace')
      gs.getState().loadRequirementDetail(activeWorkspaceId, req.id)
    } catch { addToast({ type: 'error', message: 'Failed to remove relation' }) }
  }

  return (
    <div className="space-y-6">
      <TaskDrawer task={drawerTask} phase={selectedPhase} artifacts={artifacts} open={drawerTask !== null} onClose={() => setDrawerTask(null)} t={t} />

      {/* ① Header — same typography + shell as Dashboard summary cards */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="rounded-xl border border-border-subtle bg-surface-1/30 p-5 space-y-4"
      >
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-semibold text-text-primary tracking-tight">{req.title}</h2>
            {req.description && (
              <div className="mt-1">
                <p className={`text-sm text-text-tertiary leading-relaxed ${descExpanded ? '' : 'line-clamp-2'}`}>{req.description}</p>
                {req.description.length > 96 && (
                  <button
                    type="button"
                    onClick={() => setDescExpanded(e => !e)}
                    className="mt-1.5 text-[11px] font-medium text-accent hover:text-accent/90 transition-colors cursor-pointer"
                  >
                    {descExpanded ? t('requirement.detail.collapseDesc') : t('requirement.detail.expandDesc')}
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
            {req.priority && <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md uppercase ${PRIORITY_COLORS[req.priority] || PRIORITY_COLORS.p3}`}>{req.priority}</span>}
            <span className={`px-2 py-0.5 text-[10px] font-medium rounded-md ${STATUS_COLORS[req.status] || STATUS_COLORS.draft}`}>{t(`requirement.status.${req.status}` as any)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={handleAISummary} disabled={workflowRunning || summaryLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-40 cursor-pointer">
            {summaryLoading ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {t('requirement.run')}
          </button>
          {allCurrentDone && nextPhaseType && (
            <button onClick={handleAdvancePhase}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-success/15 text-success rounded-lg hover:bg-success/20 transition-colors cursor-pointer">
              <SkipForward className="w-3.5 h-3.5" />{t('requirement.advance' as any)}
            </button>
          )}
          {(req.status === 'completed' || allCurrentDone) && (
            <button onClick={() => resetRequirementPhase(req.id, req.currentPhase)} disabled={workflowRunning}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-surface-3 hover:bg-surface-4 text-text-secondary rounded-lg transition-colors disabled:opacity-40 cursor-pointer">
              <RotateCcw className="w-3.5 h-3.5" />{t('requirement.reset')}
            </button>
          )}
          <button onClick={() => setShowRelations(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors cursor-pointer ${showRelations ? 'bg-accent/15 text-accent' : 'bg-surface-3 hover:bg-surface-4 text-text-secondary'}`}>
            <Link2 className="w-3.5 h-3.5" />{t('phase.tab.relations')}
            {relations.length > 0 && <span className="text-[10px] font-mono opacity-70">({relations.length})</span>}
          </button>
          {iteration > 1 && (
            <span className="flex items-center gap-0.5 text-[10px] font-mono text-warning ml-auto">
              <RefreshCw className="w-3 h-3" /> ×{iteration}
            </span>
          )}
        </div>

        {/* Single overall progress strip — counts sit with the bar only (no duplicate clock line) */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-0.5 bg-surface-3 rounded-full overflow-hidden min-w-0">
            <motion.div className="h-full rounded-full bg-accent" initial={{ width: 0 }}
              animate={{ width: `${req.taskCount > 0 ? Math.round((req.doneCount / req.taskCount) * 100) : 0}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }} />
          </div>
          <span className="text-[10px] font-mono text-text-tertiary tabular-nums shrink-0">
            {req.doneCount}/{req.taskCount}
          </span>
        </div>
      </motion.div>

      {/* Relations panel */}
      <AnimatePresence>
        {showRelations && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
            <div className="rounded-xl border border-border-subtle bg-surface-1/30 p-5 space-y-3">
              <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
                <Link2 className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
                {t('phase.tab.relations')}
                {relations.length > 0 && <span className="text-[10px] font-mono text-text-tertiary/60 font-normal normal-case">({relations.length})</span>}
              </h4>
              {relations.length === 0 && !addingRelation && (
                <div className="py-4 text-center">
                  <Link2 className="w-6 h-6 mx-auto mb-2 text-text-tertiary/30" />
                  <p className="text-xs text-text-tertiary">{t('requirement.relation.empty' as any)}</p>
                </div>
              )}
              {relations.map(rel => (
                <div key={rel.id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-surface-2/35 transition-colors group -mx-1">
                  <span className="text-[10px] font-medium text-accent bg-accent/10 px-1.5 py-0.5 rounded">{t(`requirement.relation.${rel.relationType}` as any)}</span>
                  <span className="text-xs text-text-primary flex-1 truncate">{rel.targetTitle}</span>
                  {rel.relationType === 'depends_on' && <AlertTriangle className="w-3 h-3 text-warning shrink-0" />}
                  <button onClick={() => handleRemoveRelation(rel)} className="p-0.5 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-danger cursor-pointer transition-opacity"><X className="w-3 h-3" /></button>
                </div>
              ))}
              {addingRelation ? (
                <div className="space-y-2 p-3 rounded-lg bg-surface-2/40 border border-accent/25">
                  <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-wide">{t('requirement.relation.type')}</p>
                  <StyledSelect value={newRelType} onValueChange={v => setNewRelType(v as RelationType)}>
                    {RELATION_TYPES.map(rt => <SelectItem key={rt.value} value={rt.value}>{t(rt.labelKey as any)}</SelectItem>)}
                  </StyledSelect>
                  <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-wide mt-2">{t('view.requirements')}</p>
                  {otherReqs.length === 0 ? (
                    <div className="px-3 py-2 rounded-lg bg-surface-3 text-xs text-text-tertiary">{t('requirement.relation.noOther' as any)}</div>
                  ) : (
                    <StyledSelect value={newRelTarget} onValueChange={setNewRelTarget} placeholder={t('requirement.relation.select')}>
                      {otherReqs.map(r => <SelectItem key={r.id} value={r.id}>{r.title}</SelectItem>)}
                    </StyledSelect>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button onClick={handleAddRelation} disabled={!newRelTarget || otherReqs.length === 0}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-40 cursor-pointer transition-colors">
                      <Check className="w-3 h-3" />{t('requirement.relation.add')}
                    </button>
                    <button onClick={() => setAddingRelation(false)} className="px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary bg-surface-3 rounded-lg cursor-pointer transition-colors">
                      {t('task.cancel' as any)}
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setAddingRelation(true)}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs text-text-tertiary hover:text-text-primary bg-surface-2/25 hover:bg-surface-2/40 border border-dashed border-border-subtle rounded-lg w-full transition-colors cursor-pointer">
                  <Plus className="w-3.5 h-3.5" />{t('requirement.relation.add')}
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ② Phase Matrix — wrapped like Dashboard metric panels */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.05 }}
        className="rounded-xl border border-border-subtle bg-surface-1/30 p-5"
      >
        <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-4 flex items-center gap-2">
          <Layers className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
          {t('phase.title')}
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-1.5">
          {PHASE_ORDER.map(ph => (
            <PhaseMatrixCard key={ph} phaseType={ph} tasks={getTasksForPhase(ph)} artifacts={getArtsForPhase(ph)}
              currentPhase={req.currentPhase} iteration={iteration} isSelected={selectedPhase === ph}
              onClick={() => { setSelectedPhase(ph); setDrawerTask(null) }} t={t} />
          ))}
        </div>
      </motion.div>

      {/* ③ Phase Task List — chrome aligned with MessageThread / requirement list */}
      <AnimatePresence mode="wait">
        <motion.div
          key={selectedPhase}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
          className="rounded-xl border border-border-subtle bg-surface-1/30 overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-border-subtle flex items-center gap-2">
            <span className={`inline-flex text-text-tertiary [&_svg]:w-3.5 [&_svg]:h-3.5 shrink-0 ${selectedPhase === req.currentPhase ? '[&_svg]:text-accent text-accent' : ''}`}>
              {meta.icon}
            </span>
            <span className="text-xs font-medium text-text-secondary">{t(meta.labelKey)}</span>
            {selectedPhase === req.currentPhase && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold rounded-md bg-accent/10 text-accent border border-accent/20">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse shrink-0" />
                {t('phase.status.active')}
              </span>
            )}
            <div className="flex-1" />
            {selectedPhaseTasks.length > 0 && (
              <span className="text-[10px] font-mono text-text-tertiary tabular-nums">
                {phaseDone}/{selectedPhaseTasks.length}
              </span>
            )}
          </div>

          <div className="p-4 space-y-1">
            {selectedPhaseTasks.length === 0 ? (
              <SuggestedTasksEmpty phase={selectedPhase} reqTitle={req.title} sendNLP={sendNLPMessageStream} t={t} />
            ) : (
              selectedPhaseTasks.map(task => (
                <PhaseTaskRow key={task.id} task={task} phase={selectedPhase} onClick={() => setDrawerTask(task)} t={t} />
              ))
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
