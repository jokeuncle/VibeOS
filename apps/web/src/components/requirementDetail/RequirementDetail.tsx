/**
 * RequirementDetail — requirement execution dashboard.
 */

import { useState, useMemo, useEffect, useLayoutEffect } from 'react'
import * as Tabs from '@radix-ui/react-tabs'
import { useWorkspaceStore } from '../../stores/workspace'
import { useUIStore } from '../../stores/ui'
import { useT } from '../../i18n'
import type { PhaseType, RequirementRelation, RelationType, Task } from '../../types'
import type { TaskRefLink, TaskLocalFile } from '../TaskLinksAndAttachments'
import type { TranslationKey } from '../../i18n/en'
import { PHASE_ORDER, PHASE_META } from './phaseMeta'
import type { RequirementDetailTab } from './types'
import { TaskDrawer } from './TaskDrawer'
import { RequirementDetailHeader } from './RequirementDetailHeader'
import { RequirementDetailWorkTab } from './RequirementDetailWorkTab'
import { RequirementDetailActivityTab } from './RequirementDetailActivityTab'
import { RequirementDetailRelationsTab } from './RequirementDetailRelationsTab'
import { RequirementDetailAgentsTab } from './RequirementDetailAgentsTab'
import { useRegisterNlpContext } from '../../hooks/useNlpContext'
import { REQUIREMENT_COMMANDS, type NlpContextDescriptor } from '../../lib/nlpContext'

export default function RequirementDetail() {
  const t = useT()
  const { workspaces, activeWorkspaceId, requirementDetail, resetRequirementPhase, workflowRunning, sendNLPMessageStream } = useWorkspaceStore()
  const { addToast } = useUIStore()

  const req = requirementDetail
  const workspace = workspaces.find(w => w.id === activeWorkspaceId)

  const [selectedPhase, setSelectedPhase] = useState<PhaseType>(() => req?.currentPhase ?? 'requirement')
  const [detailTab, setDetailTab] = useState<RequirementDetailTab>('work')
  const [addingRelation, setAddingRelation] = useState(false)
  const [newRelTarget, setNewRelTarget] = useState('')
  const [newRelType, setNewRelType] = useState<RelationType>('depends_on')
  const [drawerTask, setDrawerTask] = useState<Task | null>(null)
  const [drawerTaskRefLinks, setDrawerTaskRefLinks] = useState<Record<string, TaskRefLink[]>>({})
  const [drawerTaskLocalFiles, setDrawerTaskLocalFiles] = useState<Record<string, TaskLocalFile[]>>({})
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [descExpanded, setDescExpanded] = useState(false)

  const phaseMeta = PHASE_META[selectedPhase]
  const nlpDescriptor = useMemo<NlpContextDescriptor | null>(() => {
    if (!req) return null
    return {
      id: `requirement:${req.id}`,
      type: 'requirement',
      priority: 30,
      label: req.title,
      sublabel: phaseMeta ? t(phaseMeta.labelKey) : undefined,
      icon: selectedPhase,
      agentType: phaseMeta?.agentType ?? undefined,
      agentLabel: phaseMeta ? t(`agent.name.${phaseMeta.agentType}` as TranslationKey) : undefined,
      contextPayload: {
        phase_type: selectedPhase,
        target_agent: phaseMeta?.agentType,
        requirement_id: req.id,
      },
      commands: REQUIREMENT_COMMANDS,
      intentHints: ['execute_task', 'execute_phase', 'query_progress'],
    }
  }, [req?.id, req?.title, selectedPhase, phaseMeta, t])
  useRegisterNlpContext(nlpDescriptor)

  useLayoutEffect(() => {
    if (!req) return
    setSelectedPhase(req.currentPhase)
    setDetailTab('work')
    setDrawerTask(null)
    setDescExpanded(false)
    setDrawerTaskRefLinks({})
    setDrawerTaskLocalFiles({})
  }, [req?.id])

  useEffect(() => {
    if (detailTab !== 'relations') setAddingRelation(false)
  }, [detailTab])

  if (!req) return null

  const tasks     = req.tasks     || []
  const artifacts = req.artifacts || []
  const relations = req.relations || []
  const iteration = Number(req.iteration) || 1
  const otherReqs = (workspace?.requirements || []).filter(r => r.id !== req.id)

  const getTasksForPhase = (ph: PhaseType) => tasks.filter(t2 => workspace?.phases.find(p => p.id === t2.phaseId)?.type === ph)
  const getArtsForPhase  = (ph: PhaseType) => artifacts.filter(a => a.agentType === ph)

  const selectedPhaseTasks = getTasksForPhase(selectedPhase)
  const phaseDone = selectedPhaseTasks.filter(t2 => t2.status === 'completed').length

  const currentPhaseTasks = getTasksForPhase(req.currentPhase)
  const allCurrentDone    = currentPhaseTasks.length > 0 && currentPhaseTasks.every(t2 => t2.status === 'completed')
  const currentOrderIdx   = PHASE_ORDER.indexOf(req.currentPhase)
  const nextPhaseType     = currentOrderIdx < PHASE_ORDER.length - 1 ? PHASE_ORDER[currentOrderIdx + 1] : null

  const handleAISummary = () => {
    if (!activeWorkspaceId || summaryLoading) return
    setSummaryLoading(true)
    sendNLPMessageStream(`请对需求「${req.title}」当前的进展做一个简洁的 AI 总结，包括：\n1. 当前所在阶段（${t(PHASE_META[req.currentPhase].labelKey)}）的完成情况\n2. 各阶段任务完成率\n3. 下一步建议操作`)
    setTimeout(() => setSummaryLoading(false), 2000)
  }

  const handleAdvancePhase = async () => {
    if (!activeWorkspaceId || !nextPhaseType) return
    try {
      const { workspaceApi } = await import('../../lib/api')
      await workspaceApi.updateRequirement(activeWorkspaceId, req.id, { currentPhase: nextPhaseType })
      const { useWorkspaceStore: gs } = await import('../../stores/workspace')
      gs.getState().loadRequirementDetail(activeWorkspaceId, req.id)
      gs.getState().refreshActiveWorkspace()
      setSelectedPhase(nextPhaseType)
    } catch { addToast({ type: 'error', message: 'Failed to advance phase' }) }
  }

  const handlePublish = async () => {
    if (!activeWorkspaceId) return
    try {
      const { workspaceApi } = await import('../../lib/api')
      await workspaceApi.updateRequirement(activeWorkspaceId, req.id, { status: 'ready' })
      const { useWorkspaceStore: gs } = await import('../../stores/workspace')
      gs.getState().loadRequirementDetail(activeWorkspaceId, req.id)
      gs.getState().refreshActiveWorkspace()
      addToast({ type: 'success', message: t('requirement.publishConfirm' as any) })
    } catch { addToast({ type: 'error', message: 'Failed to publish requirement' }) }
  }

  const handleUnpublish = async () => {
    if (!activeWorkspaceId) return
    try {
      const { workspaceApi } = await import('../../lib/api')
      await workspaceApi.updateRequirement(activeWorkspaceId, req.id, { status: 'draft' })
      const { useWorkspaceStore: gs } = await import('../../stores/workspace')
      gs.getState().loadRequirementDetail(activeWorkspaceId, req.id)
      gs.getState().refreshActiveWorkspace()
      addToast({ type: 'info', message: t('requirement.unpublishDesc' as any) })
    } catch { addToast({ type: 'error', message: 'Failed to unpublish requirement' }) }
  }

  const handleAddRelation = async () => {
    if (!activeWorkspaceId || !newRelTarget) return
    try {
      const { workspaceApi } = await import('../../lib/api')
      await workspaceApi.addRequirementRelation(activeWorkspaceId, req.id, { targetId: newRelTarget, relationType: newRelType })
      setAddingRelation(false); setNewRelTarget('')
      const { useWorkspaceStore: gs } = await import('../../stores/workspace')
      gs.getState().loadRequirementDetail(activeWorkspaceId, req.id)
      gs.getState().refreshActiveWorkspace()
    } catch { addToast({ type: 'error', message: 'Failed to add relation' }) }
  }

  const handleRemoveRelation = async (rel: RequirementRelation) => {
    if (!activeWorkspaceId) return
    try {
      const { workspaceApi } = await import('../../lib/api')
      await workspaceApi.removeRequirementRelation(activeWorkspaceId, req.id, rel.id)
      const { useWorkspaceStore: gs } = await import('../../stores/workspace')
      gs.getState().loadRequirementDetail(activeWorkspaceId, req.id)
      gs.getState().refreshActiveWorkspace()
    } catch { addToast({ type: 'error', message: 'Failed to remove relation' }) }
  }

  return (
    <div className="space-y-6">
      <TaskDrawer
        task={drawerTask}
        phase={selectedPhase}
        artifacts={artifacts}
        open={drawerTask !== null}
        onClose={() => setDrawerTask(null)}
        t={t}
        refLinks={drawerTask ? (drawerTaskRefLinks[drawerTask.id] ?? []) : []}
        onRefLinksChange={(links) => {
          if (!drawerTask) return
          setDrawerTaskRefLinks((p) => ({ ...p, [drawerTask.id]: links }))
        }}
        localFiles={drawerTask ? (drawerTaskLocalFiles[drawerTask.id] ?? []) : []}
        onLocalFilesChange={(files) => {
          if (!drawerTask) return
          setDrawerTaskLocalFiles((p) => ({ ...p, [drawerTask.id]: files }))
        }}
      />

      <RequirementDetailHeader
        req={req}
        t={t}
        descExpanded={descExpanded}
        setDescExpanded={setDescExpanded}
        iteration={iteration}
        summaryLoading={summaryLoading}
        workflowRunning={workflowRunning}
        allCurrentDone={allCurrentDone}
        nextPhaseType={nextPhaseType}
        handleAISummary={handleAISummary}
        handlePublish={handlePublish}
        handleUnpublish={handleUnpublish}
        handleAdvancePhase={handleAdvancePhase}
        resetRequirementPhase={resetRequirementPhase}
      />

      <Tabs.Root
        value={detailTab}
        onValueChange={(v) => setDetailTab(v as RequirementDetailTab)}
        className="space-y-6"
      >
        <Tabs.List className="flex flex-wrap gap-0.5 sm:gap-1 border-b border-border-subtle overflow-x-auto pb-px [-webkit-overflow-scrolling:touch]">
          {([
            { id: 'work' as const, label: t('requirement.detail.tab.work' as TranslationKey) },
            { id: 'activity' as const, label: t('requirement.detail.tab.activity' as TranslationKey) },
            { id: 'relations' as const, label: t('phase.tab.relations'), badge: relations.length },
            { id: 'agents' as const, label: t('requirement.detail.tab.agents' as TranslationKey) },
          ]).map((tab) => (
            <Tabs.Trigger
              key={tab.id}
              value={tab.id}
              className="flex items-center gap-1.5 px-3 py-2.5 text-[11px] font-medium border-b-2 -mb-px transition-colors cursor-pointer outline-none shrink-0 text-text-tertiary border-transparent hover:text-text-secondary data-[state=active]:text-accent data-[state=active]:border-accent"
            >
              {tab.label}
              {tab.badge != null && tab.badge > 0 && (
                <span className="text-[10px] font-mono opacity-60 tabular-nums">({tab.badge})</span>
              )}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="work" className="outline-none focus-visible:ring-0 space-y-6 mt-0">
          <RequirementDetailWorkTab
            reqTitle={req.title}
            reqCurrentPhase={req.currentPhase}
            iteration={iteration}
            selectedPhase={selectedPhase}
            setSelectedPhase={setSelectedPhase}
            setDrawerTask={setDrawerTask}
            getTasksForPhase={getTasksForPhase}
            getArtsForPhase={getArtsForPhase}
            selectedPhaseTasks={selectedPhaseTasks}
            phaseDone={phaseDone}
            sendNLPMessageStream={sendNLPMessageStream}
            t={t}
          />
        </Tabs.Content>

        <Tabs.Content value="activity" className="outline-none focus-visible:ring-0 mt-0">
          <RequirementDetailActivityTab requirementId={req.id} t={t} />
        </Tabs.Content>

        <Tabs.Content value="relations" className="outline-none focus-visible:ring-0 mt-0">
          <RequirementDetailRelationsTab
            relations={relations}
            otherReqs={otherReqs}
            addingRelation={addingRelation}
            setAddingRelation={setAddingRelation}
            newRelType={newRelType}
            setNewRelType={setNewRelType}
            newRelTarget={newRelTarget}
            setNewRelTarget={setNewRelTarget}
            handleAddRelation={handleAddRelation}
            handleRemoveRelation={handleRemoveRelation}
            t={t}
          />
        </Tabs.Content>

        <Tabs.Content value="agents" className="outline-none focus-visible:ring-0 mt-0">
          {workspace ? <RequirementDetailAgentsTab workspace={workspace} t={t} /> : null}
        </Tabs.Content>
      </Tabs.Root>
    </div>
  )
}
