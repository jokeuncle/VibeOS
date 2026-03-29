import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { Plus, MessageCircle, Sparkles, FileStack, LayoutGrid, GitBranch, ChevronLeft } from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspace'
import { useUIStore } from '../stores/ui'
import { useT } from '../i18n'
import type { TranslationKey } from '../i18n/en'
import Sidebar from './Sidebar'
import MessageThread from './MessageThread'
import Dashboard from './Dashboard'
import AgentTopology from './AgentTopology'
import AgentLogStream from './AgentLogStream'
import AgentTimeline from './AgentTimeline'
import GanttChart from './GanttChart'
import RequirementList from './RequirementList'
import RequirementDetail from './RequirementDetail'
import RequirementKanban from './RequirementKanban'
import RequirementGraph from './RequirementGraph'
import WorkspaceSettings from './WorkspaceSettings'
import type { PhaseStatus } from '../types'

type ViewMode = 'dashboard' | 'requirements' | 'agents' | 'settings'

const REQ_SUB_VIEWS: { key: 'list' | 'kanban' | 'graph'; icon: typeof FileStack; labelKey: TranslationKey }[] = [
  { key: 'list', icon: FileStack, labelKey: 'reqSubView.list' },
  { key: 'kanban', icon: LayoutGrid, labelKey: 'reqSubView.kanban' },
  { key: 'graph', icon: GitBranch, labelKey: 'reqSubView.graph' },
]

function ViewContent() {
  const { activeRequirementId } = useWorkspaceStore()
  const workspace = useWorkspaceStore(s => s.workspaces.find(w => w.id === s.activeWorkspaceId))
  const { viewMode, reqSubView } = useUIStore()
  const t = useT()
  const currentMode = (viewMode as ViewMode) || 'dashboard'

  if (!workspace) return null

  if (currentMode === 'dashboard') {
    return <Dashboard phases={workspace.phases} agents={workspace.agents} />
  }

  if (currentMode === 'requirements') {
    if (activeRequirementId) return <RequirementDetail key={activeRequirementId} />
    if (reqSubView === 'kanban') return <RequirementKanban />
    if (reqSubView === 'graph') return <RequirementGraph />
    return <RequirementList />
  }

  if (currentMode === 'agents') {
    const phases = workspace.phases
    return (
      <div className="space-y-6">
        <AgentTopology agents={workspace.agents} />

        {/* Phase progress — agent-driven SDLC phases */}
        {phases.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-xl border border-border-subtle bg-surface-1/30 p-5"
          >
            <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-4">
              {t('dashboard.phaseProgress')}
            </h4>
            <div className="space-y-3">
              {phases.map((p) => {
                const statusColor: Record<PhaseStatus, string> = {
                  completed: 'bg-success',
                  in_progress: 'bg-accent',
                  pending: 'bg-surface-4',
                }
                return (
                  <div key={p.id} className="flex items-center gap-3">
                    <span className="text-xs text-text-secondary w-24 truncate">
                      {t(`phase.${p.type}` as TranslationKey)}
                    </span>
                    <div className="flex-1 h-2 bg-surface-3 rounded-full overflow-hidden">
                      <motion.div
                        className={`h-full rounded-full ${statusColor[p.status]}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${p.progress}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                      />
                    </div>
                    <span className="text-[10px] font-mono text-text-tertiary w-8 text-right">{p.progress}%</span>
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}

        {/* Gantt — phase timeline */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <GanttChart phases={phases} startDate={workspace.createdAt} />
        </motion.div>

        <AgentTimeline agents={workspace.agents} />
        <AgentLogStream agents={workspace.agents} />
      </div>
    )
  }

  if (currentMode === 'settings') {
    return <WorkspaceSettings />
  }

  return null
}

export default function WorkspaceView() {
  const { activeWorkspaceId, workspaces, activeRequirementId, requirementDetail, setActiveRequirement } = useWorkspaceStore()
  const { viewMode, reqSubView, setReqSubView, setReqCreating, openAgentChat, setNlpContext } = useUIStore()
  const t = useT()
  const workspace = workspaces.find((w) => w.id === activeWorkspaceId)

  // Clear NLP context when leaving requirement detail
  useEffect(() => {
    if (!activeRequirementId) {
      setNlpContext(null)
    }
  }, [activeRequirementId, setNlpContext])

  if (!workspace) return null

  const requirements = workspace.requirements || []
  const reqCount = requirements.length
  const currentViewMode = (viewMode as ViewMode) || 'dashboard'
  const inReqDetail = currentViewMode === 'requirements' && !!activeRequirementId
  const showReqToolbar = currentViewMode === 'requirements' && !activeRequirementId

  const maxW = inReqDetail ? 'max-w-5xl' : (reqSubView === 'kanban' || reqSubView === 'graph') ? 'max-w-4xl' : 'max-w-3xl'

  return (
    <div className="flex-1 flex overflow-hidden">
      <Sidebar />

      <motion.main
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="flex-1 overflow-y-auto"
      >
        {/* Requirements toolbar */}
        {showReqToolbar && (
          <div className="sticky top-0 z-10 bg-surface-0/90 backdrop-blur-sm border-b border-border-subtle">
            <div className={`mx-auto px-8 py-2 ${maxW} flex items-center gap-3`}>
              <span className="text-xs font-semibold text-text-secondary">{t('sidebar.requirements')}</span>
              <span className="text-[10px] font-mono text-text-tertiary tabular-nums">{reqCount}</span>

              <div className="flex-1" />

              {/* Segmented view toggle */}
              <div className="flex items-center gap-px p-0.5 rounded-md bg-surface-2 border border-border-subtle">
                {REQ_SUB_VIEWS.map(({ key, icon: Icon, labelKey }) => {
                  const isActive = reqSubView === key
                  return (
                    <button
                      key={key}
                      onClick={() => setReqSubView(key)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-all cursor-pointer ${
                        isActive
                          ? 'bg-surface-4 text-text-primary'
                          : 'text-text-tertiary hover:text-text-secondary'
                      }`}
                    >
                      <Icon className="w-3 h-3 shrink-0" />
                      <span>{t(labelKey)}</span>
                    </button>
                  )
                })}
              </div>

              <button
                onClick={() => {
                  if (reqSubView !== 'list') setReqSubView('list')
                  setReqCreating(true)
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-accent hover:bg-accent/90 text-white text-[11px] font-medium cursor-pointer transition-colors"
              >
                <Plus className="w-3 h-3" />
                {t('requirement.create')}
              </button>
            </div>
          </div>
        )}

        <div className={`mx-auto px-8 py-6 ${maxW}`}>
          {/* Breadcrumb when viewing requirement detail */}
          {inReqDetail && (
            <div className="flex items-center gap-2 mb-5">
              <button
                onClick={() => setActiveRequirement(null)}
                className="flex items-center gap-1 text-[11px] text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                {t('view.requirements')}
              </button>
              <span className="text-text-tertiary text-[11px]">/</span>
              <span className="text-[11px] font-medium text-text-secondary truncate max-w-xs">
                {requirementDetail?.title}
              </span>
            </div>
          )}

          {/* Empty state */}
          {showReqToolbar && reqCount === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-dashed border-border-default bg-surface-1/30 p-10 text-center mb-8"
            >
              <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-6 h-6 text-accent" />
              </div>
              <h3 className="text-lg font-semibold text-text-primary mb-2">{t('emptyState.title')}</h3>
              <p className="text-sm text-text-tertiary mb-6 max-w-sm mx-auto">{t('emptyState.desc')}</p>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => { setReqSubView('list'); setReqCreating(true) }}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium cursor-pointer transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  {t('requirement.create')}
                </button>
                <button
                  onClick={() => {
                    const pmAgent = workspace.agents.find((a) => a.type === 'pm') || workspace.agents[0]
                    if (pmAgent) openAgentChat(pmAgent.id)
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-3 hover:bg-surface-4 text-text-secondary text-sm font-medium cursor-pointer transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  {t('emptyState.talkAgent')}
                </button>
              </div>
            </motion.div>
          )}

          <ViewContent />

          <MessageThread />
          <div className="h-20" />
        </div>
      </motion.main>
    </div>
  )
}
