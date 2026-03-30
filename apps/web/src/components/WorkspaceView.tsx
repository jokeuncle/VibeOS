import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Sparkles, FileStack, LayoutGrid, GitBranch, ChevronLeft, ListChecks } from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspace'
import { useUIStore } from '../stores/ui'
import { useT } from '../i18n'
import type { TranslationKey } from '../i18n/en'
import Sidebar from './Sidebar'
import MessageThread from './MessageThread'
import Dashboard from './Dashboard'
import RequirementList from './RequirementList'
import RequirementDetail from './RequirementDetail'
import RequirementKanban from './RequirementKanban'
import RequirementGraph from './RequirementGraph'
import WorkspaceSettings from './WorkspaceSettings'
import WorkspaceKnowledgeBase from './WorkspaceKnowledgeBase'
import WorkspaceProjectMemory from './WorkspaceProjectMemory'
import WorkspaceTechKnowledge from './WorkspaceTechKnowledge'
import WorkspacePipeline from './WorkspacePipeline'
import WorkspaceAgentTeam from './WorkspaceAgentTeam'
import WorkspaceIntegrations from './WorkspaceIntegrations'
import WorkspaceContext from './WorkspaceContext'
import WorkspaceTraces from './WorkspaceTraces'
import WorkspaceBudget from './WorkspaceBudget'

type ViewMode =
  | 'dashboard'
  | 'requirements'
  | 'pipeline'
  | 'agentTeam'
  | 'integrations'
  | 'context'
  | 'traces'
  | 'budget'
  | 'knowledgeBase'
  | 'projectMemory'
  | 'techKnowledge'
  | 'settings'

const REQ_SUB_VIEWS: { key: 'list' | 'kanban' | 'graph'; icon: typeof FileStack; labelKey: TranslationKey }[] = [
  { key: 'list', icon: FileStack, labelKey: 'reqSubView.list' },
  { key: 'kanban', icon: LayoutGrid, labelKey: 'reqSubView.kanban' },
  { key: 'graph', icon: GitBranch, labelKey: 'reqSubView.graph' },
]

function ViewContent() {
  const { activeRequirementId } = useWorkspaceStore()
  const workspace = useWorkspaceStore(s => s.workspaces.find(w => w.id === s.activeWorkspaceId))
  const { viewMode, reqSubView } = useUIStore()
  const currentMode = (viewMode as ViewMode) || 'requirements'

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

  if (currentMode === 'pipeline') return <WorkspacePipeline />
  if (currentMode === 'agentTeam') return <WorkspaceAgentTeam />
  if (currentMode === 'integrations') return <WorkspaceIntegrations />
  if (currentMode === 'context') return <WorkspaceContext />
  if (currentMode === 'traces') return <WorkspaceTraces />
  if (currentMode === 'budget') return <WorkspaceBudget />

  // Legacy routes kept for backward compat
  if (currentMode === 'knowledgeBase') return <WorkspaceKnowledgeBase />
  if (currentMode === 'projectMemory') return <WorkspaceProjectMemory />
  if (currentMode === 'techKnowledge') return <WorkspaceTechKnowledge />

  if (currentMode === 'settings') return <WorkspaceSettings />

  return null
}

export default function WorkspaceView() {
  const { activeWorkspaceId, workspaces, activeRequirementId, requirementDetail, setActiveRequirement } = useWorkspaceStore()
  const { viewMode, reqSubView, setReqSubView, setReqCreating, openAgentChat, setNlpContext, reqCreating } = useUIStore()
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
  const currentViewMode = (viewMode as ViewMode) || 'requirements'
  const inReqDetail = currentViewMode === 'requirements' && !!activeRequirementId
  const showReqToolbar = currentViewMode === 'requirements' && !activeRequirementId
  const listEmptyIdle =
    showReqToolbar && reqSubView === 'list' && reqCount === 0 && !reqCreating

  const wideWorkspaceViews =
    currentViewMode === 'requirements' ||
    currentViewMode === 'knowledgeBase' ||
    currentViewMode === 'projectMemory' ||
    currentViewMode === 'techKnowledge' ||
    currentViewMode === 'pipeline' ||
    currentViewMode === 'agentTeam' ||
    currentViewMode === 'integrations' ||
    currentViewMode === 'context' ||
    currentViewMode === 'traces' ||
    currentViewMode === 'budget'
  const maxW = wideWorkspaceViews ? 'max-w-5xl' : 'max-w-3xl'

  return (
    <div className="flex-1 flex overflow-hidden">
      <Sidebar />

      <motion.main
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="flex-1 overflow-y-auto"
      >
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

          {/* Requirements page header + controls */}
          {showReqToolbar && (
            <div className="mb-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <ListChecks className="w-4 h-4 text-accent" />
                    <h1 className="text-base font-semibold text-text-primary tracking-tight">
                      {t('sidebar.requirements')}
                    </h1>
                    <span className="text-[11px] font-mono text-text-tertiary tabular-nums">{reqCount}</span>
                  </div>
                  <p className="text-[12px] text-text-tertiary">{t('requirement.listDesc')}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0 mt-0.5">
                  {/* View toggle */}
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
                    type="button"
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

              {/* Zero-requirement onboarding hero — hide while form is open */}
              <AnimatePresence>
                {reqCount === 0 && reqSubView === 'list' && !reqCreating && (
                  <motion.div
                    key="empty-hero"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }}
                    className="rounded-2xl border border-dashed border-border-default bg-surface-1/30 p-10 text-center mt-6"
                  >
                    <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-4">
                      <Sparkles className="w-6 h-6 text-accent" />
                    </div>
                    <h3 className="text-lg font-semibold text-text-primary mb-2">{t('emptyState.title')}</h3>
                    <p className="text-sm text-text-tertiary mb-6 max-w-sm mx-auto leading-relaxed">{t('emptyState.desc')}</p>
                    <div className="flex items-center justify-center gap-2 text-xs text-text-tertiary">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-2/60 border border-border-subtle">
                        <Sparkles className="w-3 h-3 text-accent" />
                        {t('emptyState.inputHint')}
                      </span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          <div className="space-y-6">
            {currentViewMode === 'requirements' && !activeRequirementId && !listEmptyIdle ? (
              <div className="rounded-xl border border-border-subtle bg-surface-1/30 overflow-hidden">
                <div className="p-4 sm:p-5">
                  <ViewContent />
                </div>
              </div>
            ) : (
              <ViewContent />
            )}
            <MessageThread />
          </div>
          <div className="h-20" />
        </div>
      </motion.main>
    </div>
  )
}
