import { useState } from 'react'
import { motion } from 'framer-motion'
import { List, LayoutGrid, BarChart3, Check, X, Plus, MessageCircle, Sparkles } from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspace'
import { useUIStore } from '../stores/ui'
import { useT } from '../i18n'
import Sidebar from './Sidebar'
import PhaseCard from './PhaseCard'
import AgentPanel from './AgentPanel'
import MessageThread from './MessageThread'
import BoardView from './BoardView'
import Dashboard from './Dashboard'
import ActivityLog from './ActivityLog'
import type { TranslationKey } from '../i18n/en'

function ProgressRing({ progress }: { progress: number }) {
  const radius = 28
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (progress / 100) * circumference

  return (
    <svg width="72" height="72" className="transform -rotate-90">
      <circle cx="36" cy="36" r={radius} fill="none" stroke="var(--color-surface-3)" strokeWidth="3" />
      <motion.circle
        cx="36" cy="36" r={radius}
        fill="none" stroke="url(#progressGradient)" strokeWidth="3"
        strokeLinecap="round" strokeDasharray={circumference}
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 1, ease: 'easeOut', delay: 0.2 }}
      />
      <defs>
        <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="var(--color-accent)" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
    </svg>
  )
}

type ViewMode = 'list' | 'board' | 'dashboard'

export default function WorkspaceView() {
  const { activeWorkspaceId, activePhaseId, workspaces, updateWorkspace } = useWorkspaceStore()
  const { viewMode, setViewMode, addToast } = useUIStore()
  const t = useT()
  const workspace = workspaces.find((w) => w.id === activeWorkspaceId)

  const [editingTitle, setEditingTitle] = useState(false)
  const [editingDesc, setEditingDesc] = useState(false)
  const [draftTitle, setDraftTitle] = useState(workspace?.name || '')
  const [draftDesc, setDraftDesc] = useState(workspace?.description || '')

  if (!workspace) return null

  function saveTitle() {
    if (draftTitle.trim()) {
      updateWorkspace(workspace.id, { name: draftTitle.trim() })
      addToast({ type: 'success', message: t('workspace.updated') })
    }
    setEditingTitle(false)
  }

  function saveDesc() {
    updateWorkspace(workspace.id, { description: draftDesc.trim() })
    addToast({ type: 'success', message: t('workspace.updated') })
    setEditingDesc(false)
  }

  const displayedPhases = activePhaseId
    ? workspace.phases.filter((p) => p.id === activePhaseId)
    : workspace.phases

  const completedPhases = workspace.phases.filter((p) => p.status === 'completed').length
  const totalTasks = workspace.phases.reduce((a, p) => a + p.tasks.length, 0)

  const currentViewMode: ViewMode = viewMode as ViewMode

  return (
    <div className="flex-1 flex overflow-hidden">
      <Sidebar />

      <motion.main
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="flex-1 overflow-y-auto"
      >
        <div className="max-w-3xl mx-auto px-8 py-8">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="flex items-center gap-6 mb-10"
          >
            <div className="relative">
              <ProgressRing progress={workspace.progress} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-sm font-semibold text-text-primary font-mono">
                  {workspace.progress}
                  <span className="text-[10px] text-text-tertiary">%</span>
                </span>
              </div>
            </div>

            <div className="flex-1">
              {editingTitle ? (
                <div className="flex items-center gap-1.5">
                  <input
                    autoFocus
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditingTitle(false) }}
                    className="text-xl font-semibold tracking-tight text-text-primary bg-surface-2 rounded-lg px-2 py-1 outline-none border border-accent/40 w-full"
                  />
                  <button onClick={saveTitle} className="p-1 text-success hover:bg-surface-3 rounded cursor-pointer"><Check className="w-4 h-4" /></button>
                  <button onClick={() => setEditingTitle(false)} className="p-1 text-text-tertiary hover:bg-surface-3 rounded cursor-pointer"><X className="w-4 h-4" /></button>
                </div>
              ) : (
                <h2
                  className="text-xl font-semibold tracking-tight text-text-primary cursor-pointer hover:bg-surface-2/50 rounded-lg px-2 py-1 -ml-2 transition-colors"
                  onClick={() => { setDraftTitle(workspace.name); setEditingTitle(true) }}
                  title={t('workspace.rename')}
                >
                  {workspace.name || t('workspace.untitled')}
                </h2>
              )}

              {editingDesc ? (
                <div className="flex items-center gap-1.5 mt-1">
                  <input
                    autoFocus
                    value={draftDesc}
                    onChange={(e) => setDraftDesc(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveDesc(); if (e.key === 'Escape') setEditingDesc(false) }}
                    className="text-sm text-text-tertiary bg-surface-2 rounded-lg px-2 py-1 outline-none border border-accent/40 w-full"
                  />
                  <button onClick={saveDesc} className="p-1 text-success hover:bg-surface-3 rounded cursor-pointer"><Check className="w-4 h-4" /></button>
                  <button onClick={() => setEditingDesc(false)} className="p-1 text-text-tertiary hover:bg-surface-3 rounded cursor-pointer"><X className="w-4 h-4" /></button>
                </div>
              ) : (
                <p
                  className="text-sm text-text-tertiary mt-1 cursor-pointer hover:bg-surface-2/50 rounded-lg px-2 py-1 -ml-2 transition-colors"
                  onClick={() => { setDraftDesc(workspace.description); setEditingDesc(true) }}
                >
                  {workspace.description || t('workspace.untitledDesc')}
                </p>
              )}
              <div className="flex items-center gap-4 mt-3">
                <span className="text-[11px] font-mono text-text-tertiary">
                  {completedPhases} {t('progress.of')} {workspace.phases.length} {t('progress.phasesComplete')}
                </span>
                <span className="text-[11px] font-mono text-text-tertiary">
                  {totalTasks} {t('progress.tasks')}
                </span>
              </div>
            </div>
          </motion.div>

          {/* View toggle */}
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
              {currentViewMode === 'dashboard'
                ? t('view.dashboard')
                : activePhaseId ? t('phase.phaseDetail') : t('phase.allPhases')}
            </span>
            <div className="flex-1 h-px bg-border-subtle" />
            <div className="flex items-center bg-surface-2 rounded-lg p-0.5 border border-border-subtle">
              {([
                { mode: 'list' as ViewMode, Icon: List, label: 'view.list' },
                { mode: 'board' as ViewMode, Icon: LayoutGrid, label: 'view.board' },
                { mode: 'dashboard' as ViewMode, Icon: BarChart3, label: 'view.dashboard' },
              ] as const).map(({ mode, Icon }) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode as any)}
                  className={`p-1.5 rounded-md cursor-pointer transition-all ${
                    currentViewMode === mode ? 'bg-surface-4 text-text-primary' : 'text-text-tertiary hover:text-text-secondary'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                </button>
              ))}
            </div>
          </div>

          {/* Empty state */}
          {totalTasks === 0 && currentViewMode !== 'dashboard' && (
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
                  onClick={() => {
                    const firstPhase = workspace.phases[0]
                    if (firstPhase) {
                      setViewMode('list')
                    }
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium cursor-pointer transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  {t('emptyState.addTask')}
                </button>
                <button
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-3 hover:bg-surface-4 text-text-secondary text-sm font-medium cursor-pointer transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  {t('emptyState.talkAgent')}
                </button>
              </div>
            </motion.div>
          )}

          {/* Content */}
          {currentViewMode === 'dashboard' ? (
            <div className="mb-8">
              <Dashboard phases={workspace.phases} agents={workspace.agents} />
            </div>
          ) : currentViewMode === 'board' ? (
            <div className="mb-8">
              <BoardView phases={displayedPhases} />
            </div>
          ) : (
            <div className="space-y-3 mb-8">
              {displayedPhases.map((phase, i) => (
                <PhaseCard key={phase.id} phase={phase} index={i} />
              ))}
            </div>
          )}

          {/* Agent panel */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                {t('agent.title')}
              </span>
              <div className="flex-1 h-px bg-border-subtle" />
            </div>
            <AgentPanel agents={workspace.agents} />
          </div>

          {/* Activity Log */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                {t('activity.title')}
              </span>
              <div className="flex-1 h-px bg-border-subtle" />
            </div>
            <ActivityLog activities={workspace.activities} />
          </div>

          <MessageThread />
          <div className="h-20" />
        </div>
      </motion.main>
    </div>
  )
}
