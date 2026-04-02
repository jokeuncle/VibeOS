import {
  Sparkles, RotateCcw, FileText, Palette, Blocks, Code2, FlaskConical,
  Rocket, Activity, Network, Terminal, BookOpen,
  TestTube2, BarChart3, PenSquare, RefreshCw,
  Layers, Check, CheckCircle2,
  GitBranch, Users, Target, ShieldCheck, Server, Gauge, Bell, BookMarked,
  Milestone, ScrollText, Map, Columns3, Braces, Siren, TrendingUp,
} from 'lucide-react'
import type { ReactNode } from 'react'
import type { PhaseType, AgentType, Task } from '../../types'
import type { TranslationKey } from '../../i18n/en'

export const PHASE_ORDER: PhaseType[] = [
  'requirement', 'architecture', 'design', 'development', 'testing', 'deployment', 'monitoring',
]

export const PHASE_META: Record<PhaseType, { icon: ReactNode; labelKey: TranslationKey; agentType: AgentType }> = {
  requirement:  { icon: <FileText className="w-4 h-4" />,     labelKey: 'requirement.phase.requirement',  agentType: 'requirement'  },
  architecture: { icon: <Blocks className="w-4 h-4" />,       labelKey: 'requirement.phase.architecture', agentType: 'architecture' },
  design:       { icon: <Palette className="w-4 h-4" />,      labelKey: 'requirement.phase.design',       agentType: 'design'       },
  development:  { icon: <Code2 className="w-4 h-4" />,        labelKey: 'requirement.phase.development',  agentType: 'development'  },
  testing:      { icon: <FlaskConical className="w-4 h-4" />, labelKey: 'requirement.phase.testing',      agentType: 'testing'      },
  deployment:   { icon: <Rocket className="w-4 h-4" />,       labelKey: 'requirement.phase.deployment',   agentType: 'cicd'         },
  monitoring:   { icon: <Activity className="w-4 h-4" />,     labelKey: 'requirement.phase.monitoring',   agentType: 'monitoring'   },
}

export type PhaseTaskType = {
  key: string
  icon: ReactNode
  color: string
}

export const PHASE_TASK_TYPE_MAP: Record<PhaseType, PhaseTaskType[]> = {
  requirement: [
    { key: 'story',   icon: <BookOpen className="w-2.5 h-2.5" />,    color: 'bg-blue-500/15 text-blue-400 border-blue-500/20' },
    { key: 'epic',    icon: <Milestone className="w-2.5 h-2.5" />,   color: 'bg-blue-600/15 text-blue-300 border-blue-600/20' },
    { key: 'ac',      icon: <Check className="w-2.5 h-2.5" />,       color: 'bg-sky-500/15 text-sky-400 border-sky-500/20' },
  ],
  architecture: [
    { key: 'adr',     icon: <ScrollText className="w-2.5 h-2.5" />,  color: 'bg-purple-500/15 text-purple-400 border-purple-500/20' },
    { key: 'diagram', icon: <Network className="w-2.5 h-2.5" />,     color: 'bg-violet-500/15 text-violet-400 border-violet-500/20' },
    { key: 'design',  icon: <Braces className="w-2.5 h-2.5" />,      color: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/20' },
  ],
  design: [
    { key: 'wireframe', icon: <Map className="w-2.5 h-2.5" />,       color: 'bg-pink-500/15 text-pink-400 border-pink-500/20' },
    { key: 'component', icon: <Columns3 className="w-2.5 h-2.5" />,  color: 'bg-rose-500/15 text-rose-400 border-rose-500/20' },
    { key: 'flow',      icon: <GitBranch className="w-2.5 h-2.5" />, color: 'bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/20' },
    { key: 'style',     icon: <PenSquare className="w-2.5 h-2.5" />, color: 'bg-purple-400/15 text-purple-300 border-purple-400/20' },
  ],
  development: [
    { key: 'feature',  icon: <Sparkles className="w-2.5 h-2.5" />,   color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' },
    { key: 'fix',      icon: <ShieldCheck className="w-2.5 h-2.5" />, color: 'bg-red-500/15 text-red-400 border-red-500/20' },
    { key: 'refactor', icon: <RefreshCw className="w-2.5 h-2.5" />,  color: 'bg-teal-500/15 text-teal-400 border-teal-500/20' },
    { key: 'config',   icon: <Terminal className="w-2.5 h-2.5" />,   color: 'bg-green-600/15 text-green-400 border-green-600/20' },
  ],
  testing: [
    { key: 'unit',        icon: <TestTube2 className="w-2.5 h-2.5" />,  color: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
    { key: 'integration', icon: <Layers className="w-2.5 h-2.5" />,     color: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20' },
    { key: 'e2e',         icon: <Target className="w-2.5 h-2.5" />,     color: 'bg-orange-500/15 text-orange-400 border-orange-500/20' },
    { key: 'perf',        icon: <Gauge className="w-2.5 h-2.5" />,      color: 'bg-amber-600/15 text-amber-300 border-amber-600/20' },
  ],
  deployment: [
    { key: 'staging',    icon: <Server className="w-2.5 h-2.5" />,      color: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20' },
    { key: 'production', icon: <Rocket className="w-2.5 h-2.5" />,      color: 'bg-sky-600/15 text-sky-300 border-sky-600/20' },
    { key: 'preview',    icon: <Target className="w-2.5 h-2.5" />,      color: 'bg-teal-500/15 text-teal-400 border-teal-500/20' },
    { key: 'rollback',   icon: <RotateCcw className="w-2.5 h-2.5" />,   color: 'bg-slate-500/15 text-slate-400 border-slate-500/20' },
  ],
  monitoring: [
    { key: 'alert',     icon: <Bell className="w-2.5 h-2.5" />,         color: 'bg-red-500/15 text-red-400 border-red-500/20' },
    { key: 'metric',    icon: <TrendingUp className="w-2.5 h-2.5" />,   color: 'bg-orange-500/15 text-orange-400 border-orange-500/20' },
    { key: 'dashboard', icon: <BarChart3 className="w-2.5 h-2.5" />,   color: 'bg-rose-500/15 text-rose-400 border-rose-500/20' },
    { key: 'incident',  icon: <Siren className="w-2.5 h-2.5" />,       color: 'bg-red-600/15 text-red-300 border-red-600/20' },
  ],
}

export const PHASE_SUGGESTED_TASKS: Record<PhaseType, { labelKey: string; icon: ReactNode }[]> = {
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

export const PHASE_EMPTY_ICON: Record<PhaseType, ReactNode> = {
  requirement:  <FileText className="w-8 h-8" />,
  architecture: <Blocks className="w-8 h-8" />,
  design:       <Palette className="w-8 h-8" />,
  development:  <Code2 className="w-8 h-8" />,
  testing:      <FlaskConical className="w-8 h-8" />,
  deployment:   <Rocket className="w-8 h-8" />,
  monitoring:   <BarChart3 className="w-8 h-8" />,
}

const GRAPH_NODE_TYPE_KEY: Record<string, string> = {
  clarify:             'story',
  stakeholders:        'epic',
  stories:             'story',
  acceptance:          'ac',
  nfr:                 'ac',
  prd:                 'story',
  tech_stack:          'design',
  system_design:       'diagram',
  data_model:          'design',
  api_design:          'adr',
  wireframe:           'wireframe',
  component_spec:      'component',
  prototype:           'flow',
  code_implementation: 'feature',
  test_plan:           'unit',
  test_implementation: 'integration',
  test_execution:      'e2e',
}

export function getTaskTypeInfo(phase: PhaseType, task: Task): PhaseTaskType {
  const types = PHASE_TASK_TYPE_MAP[phase]
  if (task.graphNodeId) {
    const key = GRAPH_NODE_TYPE_KEY[task.graphNodeId]
    if (key) {
      const found = types.find(t => t.key === key)
      if (found) return found
    }
  }
  const seed = Math.abs((task.title.charCodeAt(0) || 0) + (task.title.charCodeAt(2) || 0) + task.title.length)
  return types[seed % types.length]
}
