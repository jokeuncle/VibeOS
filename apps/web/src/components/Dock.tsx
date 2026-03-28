import { motion, AnimatePresence } from 'framer-motion'
import { Home, Search, Plus, Bot, Settings, Columns2, BarChart3, ChevronUp, ChevronDown } from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspace'
import { useUIStore } from '../stores/ui'
import { useT } from '../i18n'

interface DockItem {
  id: string
  icon: React.ReactNode
  label: string
  action: () => void
  active?: boolean
}

export default function Dock() {
  const { activeWorkspaceId, setActiveWorkspace } = useWorkspaceStore()
  const {
    setCommandPaletteOpen,
    setTemplatePickerOpen,
    setSettingsOpen,
    splitMode,
    toggleSplitMode,
    setViewMode,
    dockVisible,
    toggleDock,
  } = useUIStore()
  const t = useT()

  const globalItems: DockItem[] = [
    {
      id: 'home',
      icon: <Home className="w-5 h-5" />,
      label: t('breadcrumb.home'),
      action: () => setActiveWorkspace(null),
    },
    {
      id: 'search',
      icon: <Search className="w-5 h-5" />,
      label: t('command.title'),
      action: () => setCommandPaletteOpen(true),
    },
    {
      id: 'new',
      icon: <Plus className="w-5 h-5" />,
      label: t('workspace.new'),
      action: () => setTemplatePickerOpen(true),
    },
  ]

  const workspaceItems: DockItem[] = [
    {
      id: 'agents',
      icon: <Bot className="w-5 h-5" />,
      label: t('view.agents'),
      action: () => setViewMode('agents'),
    },
    {
      id: 'dashboard',
      icon: <BarChart3 className="w-5 h-5" />,
      label: t('view.dashboard'),
      action: () => setViewMode('dashboard'),
    },
    {
      id: 'split',
      icon: <Columns2 className="w-5 h-5" />,
      label: t('layout.split'),
      action: () => toggleSplitMode(),
      active: splitMode,
    },
  ]

  const settingsItem: DockItem = {
    id: 'settings',
    icon: <Settings className="w-5 h-5" />,
    label: t('settings.title'),
    action: () => setSettingsOpen(true),
  }

  const items = activeWorkspaceId
    ? [...globalItems, ...workspaceItems, settingsItem]
    : [...globalItems, settingsItem]

  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.5, duration: 0.4 }}
      className="fixed bottom-[92px] left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-1.5"
    >
      <AnimatePresence mode="wait">
        {dockVisible ? (
          <motion.div
            key="dock-expanded"
            initial={{ y: 12, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 12, opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="flex items-end gap-1 px-2.5 py-2 rounded-2xl bg-surface-1/80 backdrop-blur-xl border border-border-subtle shadow-2xl shadow-black/30"
          >
            {items.map((item, i) => (
              <motion.button
                key={item.id}
                onClick={item.action}
                whileHover={{ scale: 1.25, y: -6 }}
                whileTap={{ scale: 0.9 }}
                className={`relative w-11 h-11 rounded-xl flex items-center justify-center cursor-pointer transition-colors group ${
                  item.active
                    ? 'bg-accent/15 text-accent'
                    : 'text-text-tertiary hover:text-text-primary hover:bg-surface-3/60'
                }`}
              >
                {item.icon}

                <div className="absolute -top-9 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-lg bg-surface-3 border border-border-subtle text-[10px] font-medium text-text-primary whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg">
                  {item.label}
                </div>

                {item.active && (
                  <motion.div
                    layoutId="dock-dot"
                    className="absolute -bottom-1 w-1 h-1 rounded-full bg-accent"
                  />
                )}
              </motion.button>
            ))}

            {/* Collapse button */}
            <motion.button
              onClick={toggleDock}
              whileHover={{ scale: 1.15 }}
              whileTap={{ scale: 0.9 }}
              className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer text-text-tertiary/40 hover:text-text-secondary hover:bg-surface-3/60 transition-colors ml-0.5"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </motion.button>
          </motion.div>
        ) : (
          <motion.button
            key="dock-collapsed"
            initial={{ y: -8, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -8, opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onClick={toggleDock}
            whileHover={{ scale: 1.1, y: -2 }}
            whileTap={{ scale: 0.95 }}
            className="px-4 py-1.5 rounded-full bg-surface-1/70 backdrop-blur-xl border border-border-subtle shadow-lg shadow-black/20 cursor-pointer flex items-center gap-1.5 text-text-tertiary hover:text-text-secondary transition-colors"
          >
            <ChevronUp className="w-3 h-3" />
            <span className="text-[10px] font-medium">{t('layout.dock')}</span>
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
