import { motion } from 'framer-motion'
import { Plus, Layers, ChevronRight, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useWorkspaceStore } from '../stores/workspace'
import { useUIStore } from '../stores/ui'
import { useT } from '../i18n'
import ContextMenu, { useContextMenu, type ContextMenuItem } from './ui/ContextMenu'
import type { Workspace } from '../types'

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
  const { addToast } = useUIStore()
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
        deleteWorkspace(workspace.id)
        addToast({ type: 'info', message: t('workspace.deleted') })
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
              <div className="w-11 h-11 rounded-xl bg-accent/8 border border-accent/10 flex items-center justify-center">
                <Layers className="w-5 h-5 text-accent/80" />
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
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={closeMenu} />}
    </>
  )
}

export default function WorkspaceHome() {
  const { workspaces, setActiveWorkspace, createWorkspace } = useWorkspaceStore()
  const { addToast } = useUIStore()
  const t = useT()

  function handleCreate() {
    const id = createWorkspace()
    setActiveWorkspace(id)
    addToast({ type: 'success', message: t('workspace.created') })
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 flex flex-col items-center justify-center px-8 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="text-center mb-14"
        >
          <h1 className="text-[42px] font-light tracking-tight text-text-primary leading-tight">
            Any
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

        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl w-full mb-8"
        >
          {workspaces.map((ws) => (
            <WorkspaceCard
              key={ws.id}
              workspace={ws}
              onClick={() => setActiveWorkspace(ws.id)}
            />
          ))}

          <motion.button
            variants={item}
            onClick={handleCreate}
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
