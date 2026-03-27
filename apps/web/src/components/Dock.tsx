import { motion } from 'framer-motion'
import { Home, Search, Plus, Bot, Settings, Columns2, BarChart3 } from 'lucide-react'
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
    addToast,
  } = useUIStore()
  const t = useT()

  const items: DockItem[] = [
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
    {
      id: 'agents',
      icon: <Bot className="w-5 h-5" />,
      label: t('view.agents'),
      action: () => {
        if (activeWorkspaceId) setViewMode('agents')
        else addToast({ type: 'info', message: t('workspace.selectFirst') })
      },
    },
    {
      id: 'dashboard',
      icon: <BarChart3 className="w-5 h-5" />,
      label: t('view.dashboard'),
      action: () => { if (activeWorkspaceId) setViewMode('dashboard') },
    },
    {
      id: 'split',
      icon: <Columns2 className="w-5 h-5" />,
      label: t('layout.split'),
      action: () => toggleSplitMode(),
      active: splitMode,
    },
    {
      id: 'settings',
      icon: <Settings className="w-5 h-5" />,
      label: t('settings.title'),
      action: () => setSettingsOpen(true),
    },
  ]

  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.5, duration: 0.4 }}
      className="fixed bottom-[92px] left-1/2 -translate-x-1/2 z-50"
    >
      <div className="flex items-end gap-1 px-2.5 py-2 rounded-2xl bg-surface-1/80 backdrop-blur-xl border border-border-subtle shadow-2xl shadow-black/30">
        {items.map((item) => (
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

            {/* Tooltip */}
            <div className="absolute -top-9 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-lg bg-surface-3 border border-border-subtle text-[10px] font-medium text-text-primary whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg">
              {item.label}
            </div>

            {/* Active dot */}
            {item.active && (
              <motion.div
                layoutId="dock-dot"
                className="absolute -bottom-1 w-1 h-1 rounded-full bg-accent"
              />
            )}
          </motion.button>
        ))}
      </div>
    </motion.div>
  )
}
