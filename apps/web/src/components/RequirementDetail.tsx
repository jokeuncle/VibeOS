import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Play, RotateCcw, FileText, Palette, Blocks,
  Code2, FlaskConical, Rocket, Activity, Link2, AlertTriangle,
  Plus, X, Check,
} from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspace'
import { useUIStore } from '../stores/ui'
import { useT } from '../i18n'
import type { PhaseType, RequirementRelation, RelationType } from '../types'
import type { ReactNode } from 'react'

const PHASE_PIPELINE: { type: PhaseType; icon: ReactNode; labelKey: string }[] = [
  { type: 'requirement', icon: <FileText className="w-4 h-4" />, labelKey: 'requirement.phase.requirement' },
  { type: 'architecture', icon: <Blocks className="w-4 h-4" />, labelKey: 'requirement.phase.architecture' },
  { type: 'design', icon: <Palette className="w-4 h-4" />, labelKey: 'requirement.phase.design' },
  { type: 'development', icon: <Code2 className="w-4 h-4" />, labelKey: 'requirement.phase.development' },
  { type: 'testing', icon: <FlaskConical className="w-4 h-4" />, labelKey: 'requirement.phase.testing' },
  { type: 'deployment', icon: <Rocket className="w-4 h-4" />, labelKey: 'requirement.phase.deployment' },
  { type: 'monitoring', icon: <Activity className="w-4 h-4" />, labelKey: 'requirement.phase.monitoring' },
]

const RELATION_TYPES: { value: RelationType; labelKey: string }[] = [
  { value: 'depends_on', labelKey: 'requirement.relation.depends_on' },
  { value: 'parent_of', labelKey: 'requirement.relation.parent_of' },
  { value: 'related_to', labelKey: 'requirement.relation.related_to' },
  { value: 'evolves_from', labelKey: 'requirement.relation.evolves_from' },
  { value: 'conflicts_with', labelKey: 'requirement.relation.conflicts_with' },
]

const STATUS_DOT: Record<string, string> = {
  pending: 'bg-surface-4',
  in_progress: 'bg-accent animate-pulse-glow',
  completed: 'bg-success',
}

export default function RequirementDetail() {
  const t = useT()
  const {
    workspaces, activeWorkspaceId, requirementDetail, setActiveRequirement,
    runRequirement, resetRequirementPhase, workflowRunning,
  } = useWorkspaceStore()
  const { addToast } = useUIStore()
  const [activeTab, setActiveTab] = useState<'tasks' | 'artifacts' | 'relations'>('tasks')
  const [addingRelation, setAddingRelation] = useState(false)
  const [newRelTarget, setNewRelTarget] = useState('')
  const [newRelType, setNewRelType] = useState<RelationType>('depends_on')

  const workspace = workspaces.find(w => w.id === activeWorkspaceId)
  const req = requirementDetail
  if (!req) return null

  const currentPhaseIdx = PHASE_PIPELINE.findIndex(p => p.type === req.currentPhase)
  const tasks = req.tasks || []
  const artifacts = req.artifacts || []
  const relations = req.relations || []
  const otherRequirements = (workspace?.requirements || []).filter(r => r.id !== req.id)

  const phaseTasks = tasks.filter(t2 => {
    const phase = workspace?.phases.find(p => p.id === t2.phaseId)
    return phase?.type === req.currentPhase
  })

  const handleRun = () => runRequirement(req.id, req.currentPhase)
  const handleReset = () => resetRequirementPhase(req.id, req.currentPhase)

  const handleAddRelation = async () => {
    if (!activeWorkspaceId || !newRelTarget) return
    try {
      const { workspaceApi } = await import('../lib/api')
      await workspaceApi.addRequirementRelation(activeWorkspaceId, req.id, {
        targetId: newRelTarget,
        relationType: newRelType,
      })
      setAddingRelation(false)
      setNewRelTarget('')
      const { useWorkspaceStore: getStore } = await import('../stores/workspace')
      getStore.getState().loadRequirementDetail(activeWorkspaceId, req.id)
    } catch {
      addToast({ type: 'error', message: 'Failed to add relation' })
    }
  }

  const handleRemoveRelation = async (rel: RequirementRelation) => {
    if (!activeWorkspaceId) return
    try {
      const { workspaceApi } = await import('../lib/api')
      await workspaceApi.removeRequirementRelation(activeWorkspaceId, req.id, rel.id)
      const { useWorkspaceStore: getStore } = await import('../stores/workspace')
      getStore.getState().loadRequirementDetail(activeWorkspaceId, req.id)
    } catch {
      addToast({ type: 'error', message: 'Failed to remove relation' })
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setActiveRequirement(null)}
          className="p-1.5 rounded-lg hover:bg-surface-3 text-text-secondary hover:text-text-primary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-text-primary truncate">{req.title}</h2>
          {req.description && <p className="text-xs text-text-tertiary mt-0.5 line-clamp-1">{req.description}</p>}
        </div>
        <div className="flex gap-2 shrink-0">
          {req.status === 'completed' || phaseTasks.every(t2 => t2.status === 'completed') ? (
            <button
              onClick={handleReset}
              disabled={workflowRunning}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-surface-3 hover:bg-surface-4 text-text-secondary rounded-lg transition-colors disabled:opacity-40"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {t('requirement.reset')}
            </button>
          ) : null}
          <button
            onClick={handleRun}
            disabled={workflowRunning || phaseTasks.every(t2 => t2.status === 'completed')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-40"
          >
            <Play className="w-3.5 h-3.5" />
            {t('requirement.run')}
          </button>
        </div>
      </div>

      {/* Phase Pipeline */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {PHASE_PIPELINE.map((phase, idx) => {
          const isActive = idx === currentPhaseIdx
          const isDone = idx < currentPhaseIdx
          return (
            <div key={phase.type} className="flex items-center gap-1 shrink-0">
              {idx > 0 && <div className={`w-6 h-px ${isDone ? 'bg-success' : 'bg-surface-4'}`} />}
              <div
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-accent/15 text-accent border border-accent/30'
                    : isDone
                      ? 'bg-success/10 text-success'
                      : 'bg-surface-2 text-text-tertiary'
                }`}
              >
                {isDone ? <Check className="w-3.5 h-3.5" /> : phase.icon}
                <span className="hidden sm:inline">{t(phase.labelKey as any)}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-border-subtle">
        {(['tasks', 'artifacts', 'relations'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-accent text-accent'
                : 'border-transparent text-text-tertiary hover:text-text-secondary'
            }`}
          >
            {t(`requirement.${tab}` as any)}
            {tab === 'tasks' && ` (${phaseTasks.length})`}
            {tab === 'artifacts' && ` (${artifacts.length})`}
            {tab === 'relations' && ` (${relations.length})`}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        {activeTab === 'tasks' && (
          <motion.div key="tasks" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
            {phaseTasks.length === 0 ? (
              <p className="text-xs text-text-tertiary py-4 text-center">No tasks for this phase</p>
            ) : (
              phaseTasks.map(task => (
                <div key={task.id} className="flex items-center gap-3 px-3 py-2.5 bg-surface-2 rounded-lg border border-border-subtle">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[task.status] || STATUS_DOT.pending}`} />
                  <span className="text-sm text-text-primary flex-1">{task.title}</span>
                  <span className="text-[10px] text-text-tertiary">{task.status.replace('_', ' ')}</span>
                </div>
              ))
            )}
          </motion.div>
        )}

        {activeTab === 'artifacts' && (
          <motion.div key="artifacts" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
            {artifacts.length === 0 ? (
              <p className="text-xs text-text-tertiary py-4 text-center">No artifacts yet</p>
            ) : (
              artifacts.map(art => (
                <details key={art.id} className="group bg-surface-2 rounded-lg border border-border-subtle">
                  <summary className="flex items-center gap-3 px-3 py-2.5 cursor-pointer list-none">
                    <FileText className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
                    <span className="text-sm text-text-primary flex-1">{art.title}</span>
                    <span className="text-[10px] text-text-tertiary">{art.type}</span>
                    <span className="text-[10px] text-text-tertiary">v{art.version}</span>
                  </summary>
                  <div className="px-3 pb-3 pt-1 border-t border-border-subtle">
                    <pre className="text-xs text-text-secondary whitespace-pre-wrap max-h-60 overflow-auto">{art.content}</pre>
                  </div>
                </details>
              ))
            )}
          </motion.div>
        )}

        {activeTab === 'relations' && (
          <motion.div key="relations" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
            {relations.map(rel => {
              const isDepWarning = rel.relationType === 'depends_on'
              return (
                <div key={rel.id} className="flex items-center gap-3 px-3 py-2.5 bg-surface-2 rounded-lg border border-border-subtle group">
                  <Link2 className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
                  <span className="text-[10px] font-medium text-accent bg-accent/10 px-1.5 py-0.5 rounded">
                    {t(`requirement.relation.${rel.relationType}` as any)}
                  </span>
                  <span className="text-sm text-text-primary flex-1 truncate">{rel.targetTitle}</span>
                  {isDepWarning && (
                    <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" />
                  )}
                  <button
                    onClick={() => handleRemoveRelation(rel)}
                    className="p-0.5 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-danger"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )
            })}

            {addingRelation ? (
              <div className="flex items-center gap-2 p-3 bg-surface-2 rounded-lg border border-accent/30">
                <select
                  value={newRelType}
                  onChange={e => setNewRelType(e.target.value as RelationType)}
                  className="bg-surface-3 border border-border-subtle rounded px-2 py-1 text-xs text-text-primary"
                >
                  {RELATION_TYPES.map(rt => (
                    <option key={rt.value} value={rt.value}>{t(rt.labelKey as any)}</option>
                  ))}
                </select>
                <select
                  value={newRelTarget}
                  onChange={e => setNewRelTarget(e.target.value)}
                  className="flex-1 bg-surface-3 border border-border-subtle rounded px-2 py-1 text-xs text-text-primary"
                >
                  <option value="">{t('requirement.relation.select')}</option>
                  {otherRequirements.map(r => (
                    <option key={r.id} value={r.id}>{r.title}</option>
                  ))}
                </select>
                <button onClick={handleAddRelation} disabled={!newRelTarget} className="p-1 text-success disabled:opacity-40">
                  <Check className="w-4 h-4" />
                </button>
                <button onClick={() => setAddingRelation(false)} className="p-1 text-text-tertiary">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setAddingRelation(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs text-text-tertiary hover:text-text-primary bg-surface-2/50 hover:bg-surface-2 border border-dashed border-border-subtle rounded-lg w-full transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                {t('requirement.relation.add')}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
