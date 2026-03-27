import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Layers, ChevronRight, Pencil, Trash2, FolderOpen, CheckSquare, ListChecks, Bot } from 'lucide-react'
import { useState } from 'react'
import { useWorkspaceStore } from '../stores/workspace'
import { useUIStore } from '../stores/ui'
import { useT } from '../i18n'
import ContextMenu, { useContextMenu, type ContextMenuItem } from './ui/ContextMenu'
import type { Workspace, WorkspaceColor } from '../types'

const COLOR_BG: Record<WorkspaceColor, string> = {
  indigo: 'bg-indigo-500/10 border-indigo-500/15',
  emerald: 'bg-emerald-500/10 border-emerald-500/15',
  rose: 'bg-rose-500/10 border-rose-500/15',
  amber: 'bg-amber-500/10 border-amber-500/15',
  cyan: 'bg-cyan-500/10 border-cyan-500/15',
  violet: 'bg-violet-500/10 border-violet-500/15',
}
const COLOR_TEXT: Record<WorkspaceColor, string> = {
  indigo: 'text-indigo-400',
  emerald: 'text-emerald-400',
  rose: 'text-rose-400',
  amber: 'text-amber-400',
  cyan: 'text-cyan-400',
  violet: 'text-violet-400',
}

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.1 },
  },
}

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
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
              <div className={`w-11 h-11 rounded-xl border flex items-center justify-center ${COLOR_BG[workspace.color] || COLOR_BG.indigo}`}>
                <Layers className={`w-5 h-5 ${COLOR_TEXT[workspace.color] || COLOR_TEXT.indigo}`} />
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
  const { workspaces, setActiveWorkspace } = useWorkspaceStore()
  const { setTemplatePickerOpen, homeSearchQuery } = useUIStore()
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
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 flex flex-col items-center justify-center px-8 overflow-y-auto">
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
      </div>
    </div>
  )
}
