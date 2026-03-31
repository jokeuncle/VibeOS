import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Layers, ChevronRight, Pencil, Trash2, FolderOpen, CheckSquare, ListChecks, Bot, Search, X } from 'lucide-react'
import { useState } from 'react'
import { useWorkspaceStore } from '../stores/workspace'
import { useUIStore } from '../stores/ui'
import { useT } from '../i18n'
import ContextMenu, { useContextMenu, type ContextMenuItem } from './ui/ContextMenu'
import ConversationThread from './ConversationThread'
import type { Workspace } from '../types'
import { WORKSPACE_CARD_BG, WORKSPACE_CARD_TEXT, workspaceColorFallback } from '../lib/workspaceColors'

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.1 },
  },
}

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
}

function WorkspaceCard({
  workspace,
  onClick,
}: {
  workspace: Workspace
  onClick: () => void
}) {
  const t = useT()
  const { deleteWorkspace, updateWorkspace } = useWorkspaceStore()
  const { addToast, showConfirm, removeTab } = useUIStore()
  const { menu, onContextMenu, closeMenu } = useContextMenu()
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(workspace.name)

  const activeAgents = workspace.agents.filter((a) => a.status === 'running').length

  const menuItems: ContextMenuItem[] = [
    {
      id: 'rename',
      label: t('workspace.rename'),
      icon: <Pencil className="w-3.5 h-3.5" />,
      onClick: () => setEditing(true),
    },
    {
      id: 'delete',
      label: t('workspace.delete'),
      icon: <Trash2 className="w-3.5 h-3.5" />,
      danger: true,
      onClick: () => {
        showConfirm({
          title: t('workspace.deleteConfirm'),
          message: t('confirm.deleteWorkspaceMsg'),
          danger: true,
          onConfirm: () => {
            removeTab(workspace.id)
            deleteWorkspace(workspace.id)
            addToast({ type: 'info', message: t('workspace.deleted') })
          },
        })
      },
    },
  ]

  const wc = workspaceColorFallback(workspace.color)

  function handleRename() {
    if (editName.trim()) {
      updateWorkspace(workspace.id, { name: editName.trim() })
      addToast({ type: 'success', message: t('workspace.updated') })
    }
    setEditing(false)
  }

  return (
    <>
      <motion.div
        variants={item}
        onContextMenu={onContextMenu}
        className="group relative rounded-2xl border border-border-subtle bg-surface-1/60 hover:bg-surface-2/80 hover:border-border-default transition-colors duration-300 cursor-pointer overflow-hidden"
      >
        <motion.div
          onClick={editing ? undefined : onClick}
          whileHover={editing ? undefined : { y: -6, transition: { duration: 0.2 } }}
          whileTap={editing ? undefined : { scale: 0.97 }}
          className="p-6 text-left"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-accent/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

          <div className="relative">
            <div className="flex items-start justify-between mb-5">
              <div className={`w-11 h-11 rounded-xl border flex items-center justify-center ${WORKSPACE_CARD_BG[wc]}`}>
                <Layers className={`w-5 h-5 ${WORKSPACE_CARD_TEXT[wc]}`} />
              </div>
              <ChevronRight className="w-4 h-4 text-text-tertiary opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-200" />
            </div>

            {editing ? (
              <form onSubmit={(e) => { e.preventDefault(); handleRename() }} onClick={(e) => e.stopPropagation()}>
                <input
                  autoFocus
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={handleRename}
                  onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false) }}
                  className="w-full px-2 py-1 -ml-2 rounded-lg bg-surface-2 border border-accent/30 text-[15px] font-semibold text-text-primary outline-none"
                />
              </form>
            ) : (
              <h3 className="font-semibold text-[15px] text-text-primary mb-1 tracking-tight">
                {workspace.name || t('workspace.untitled')}
              </h3>
            )}
            <p className="text-xs text-text-tertiary leading-relaxed mt-1">
              {workspace.description || t('workspace.untitledDesc')}
            </p>

            <div className="mt-5">
              <div className="flex justify-between items-center text-[11px] mb-2">
                <span className="text-text-tertiary font-mono">{workspace.progress}%</span>
                {activeAgents > 0 && (
                  <span className="flex items-center gap-1 text-accent">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-glow" />
                    {activeAgents} {t('progress.running')}
                  </span>
                )}
              </div>
              <div className="h-[3px] bg-surface-4 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${workspace.progress}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut', delay: 0.3 }}
                  className="h-full rounded-full bg-gradient-to-r from-accent via-accent to-violet-500"
                />
              </div>
            </div>

            <div className="mt-4 flex gap-[3px]">
              {workspace.phases.map((phase) => (
                <div
                  key={phase.id}
                  className={`h-[3px] flex-1 rounded-full transition-colors ${
                    phase.status === 'completed' ? 'bg-success/60'
                      : phase.status === 'in_progress' ? 'bg-accent/60'
                        : 'bg-surface-4'
                  }`}
                />
              ))}
            </div>
          </div>
        </motion.div>
      </motion.div>
      <AnimatePresence>
        {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={closeMenu} />}
      </AnimatePresence>
    </>
  )
}

export default function WorkspaceHome() {
  const { workspaces, setActiveWorkspace, loading } = useWorkspaceStore()
  const { setTemplatePickerOpen, homeSearchQuery, setHomeSearchQuery } = useUIStore()
  const t = useT()

  const filtered = homeSearchQuery.trim()
    ? workspaces.filter((ws) => {
        const q = homeSearchQuery.toLowerCase()
        return (
          (ws.name || '').toLowerCase().includes(q) ||
          (ws.description || '').toLowerCase().includes(q)
        )
      })
    : workspaces

  const totalTasks = workspaces.reduce((a, ws) => a + ws.phases.reduce((b, p) => b + p.tasks.length, 0), 0)
  const completedTasks = workspaces.reduce((a, ws) => a + ws.phases.reduce((b, p) => b + p.tasks.filter((t) => t.status === 'completed').length, 0), 0)
  const activeAgents = workspaces.reduce((a, ws) => a + ws.agents.filter((ag) => ag.status === 'running').length, 0)

  const stats = [
    { icon: FolderOpen, label: t('homeDash.totalWorkspaces'), value: workspaces.length, color: 'text-accent' },
    { icon: ListChecks, label: t('homeDash.totalTasks'), value: totalTasks, color: 'text-violet-400' },
    { icon: CheckSquare, label: t('homeDash.completedTasks'), value: completedTasks, color: 'text-success' },
    { icon: Bot, label: t('homeDash.activeAgents'), value: activeAgents, color: 'text-amber-400' },
  ]

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      {/* No extra bottom padding when the assistant is open — it is `absolute` and should overlay
          without reflowing `my-auto` centering (which previously “pushed” the grid upward). */}
      <div className="flex-1 flex flex-col items-center px-8 overflow-y-auto pb-4">
        <div className="my-auto py-16 w-full flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="text-center mb-10"
        >
          <h1 className="text-[42px] font-light tracking-tight text-text-primary leading-tight">
            Vibe
            <span className="font-semibold bg-gradient-to-r from-accent to-violet-400 bg-clip-text text-transparent">
              OS
            </span>
          </h1>
          <p className="text-text-tertiary text-sm mt-3 tracking-wide max-w-md mx-auto leading-relaxed">
            {t('app.subtitle')}
            <br />
            <span className="text-text-tertiary/60">{t('app.tagline')}</span>
          </p>
        </motion.div>

        {/* Global overview stats */}
        {workspaces.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.4 }}
            className="grid grid-cols-4 gap-3 max-w-2xl w-full mb-10"
          >
            {stats.map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.06 }}
                className="rounded-xl border border-border-subtle bg-surface-1/40 p-4 text-center"
              >
                <s.icon className={`w-4 h-4 mx-auto mb-2 ${s.color}`} />
                <span className={`text-xl font-semibold font-mono ${s.color}`}>{s.value}</span>
                <p className="text-[10px] text-text-tertiary mt-1">{s.label}</p>
              </motion.div>
            ))}
          </motion.div>
        )}

        {(workspaces.length > 0 || loading) && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.35 }}
          className="relative w-full max-w-4xl mb-6"
        >
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none" />
          {/* type="text": native `search` inputs add a second clear control in WebKit/Chromium. */}
          <input
            type="text"
            role="searchbox"
            value={homeSearchQuery}
            onChange={(e) => setHomeSearchQuery(e.target.value)}
            placeholder={t('homeDash.searchWorkspaces')}
            autoComplete="off"
            aria-label={t('homeDash.searchWorkspaces')}
            className="w-full h-10 pl-10 pr-10 rounded-xl border border-border-subtle bg-surface-2/40 text-sm text-text-primary placeholder:text-text-tertiary/70 outline-none focus:border-accent/35 focus:ring-1 focus:ring-accent/15 transition-colors"
          />
          {homeSearchQuery ? (
            <button
              type="button"
              onClick={() => setHomeSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg text-text-tertiary hover:text-text-secondary hover:bg-surface-3/80 transition-colors cursor-pointer"
              title={t('homeDash.clearSearch')}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : null}
        </motion.div>
        )}

        {loading && workspaces.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl w-full mb-8">
            {[0, 1, 2].map((i) => (
              <div key={i} className="p-6 rounded-2xl border border-border-subtle bg-surface-1 min-h-[200px] animate-pulse">
                <div className="h-4 w-2/3 bg-surface-3 rounded mb-3" />
                <div className="h-3 w-full bg-surface-3 rounded mb-2" />
                <div className="h-3 w-1/2 bg-surface-3 rounded mb-6" />
                <div className="h-2 w-full bg-surface-3 rounded" />
              </div>
            ))}
          </div>
        ) : (
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl w-full mb-8"
        >
          {filtered.map((ws) => (
            <WorkspaceCard
              key={ws.id}
              workspace={ws}
              onClick={() => setActiveWorkspace(ws.id)}
            />
          ))}

          <motion.button
            variants={item}
            onClick={() => setTemplatePickerOpen(true)}
            whileHover={{ y: -6, transition: { duration: 0.2 } }}
            whileTap={{ scale: 0.97 }}
            className="p-6 rounded-2xl border border-dashed border-border-subtle hover:border-accent/30 transition-all duration-300 flex flex-col items-center justify-center gap-3 text-text-tertiary hover:text-accent cursor-pointer group min-h-[200px]"
          >
            <div className="w-11 h-11 rounded-xl border border-border-default group-hover:border-accent/30 flex items-center justify-center transition-colors">
              <Plus className="w-5 h-5" />
            </div>
            <span className="text-sm font-medium">{t('workspace.new')}</span>
          </motion.button>
        </motion.div>
        )}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-6 sm:px-10 pb-3 sm:pb-4">
        <div className="pointer-events-auto w-full max-w-2xl">
          <ConversationThread
            context="home"
            onDismiss={() => useWorkspaceStore.getState().clearHomeMessages()}
          />
        </div>
      </div>
    </div>
  )
}
