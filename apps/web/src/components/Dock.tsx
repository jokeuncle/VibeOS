import { motion, AnimatePresence } from 'framer-motion'
import {
  Home, Search, Plus, Settings, LayoutDashboard, FileStack, Bot,
  Sparkles, ChevronUp, ChevronDown,
} from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspace'
import { useUIStore } from '../stores/ui'
import { useT } from '../i18n'

interface DockItem {
  id: string
  icon: React.ReactNode
  label: string
  action: () => void
  active?: boolean
  accent?: boolean
}

export default function Dock() {
  const { setActiveWorkspace, activeWorkspaceId, activeRequirementId } = useWorkspaceStore()
  const {
    setCommandPaletteOpen,
    setTemplatePickerOpen,
    setSettingsOpen,
    dockVisible,
    toggleDock,
    viewMode,
    setViewMode,
    nlpContext,
  } = useUIStore()
  const t = useT()

  // Global items — always shown when no workspace
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
    {
      id: 'settings',
      icon: <Settings className="w-5 h-5" />,
      label: t('settings.title'),
      action: () => setSettingsOpen(true),
    },
  ]

  // Workspace context items
  const workspaceItems: DockItem[] = activeWorkspaceId ? [
    {
      id: 'home',
      icon: <Home className="w-5 h-5" />,
      label: t('breadcrumb.home'),
      action: () => setActiveWorkspace(null),
    },
    {
      id: 'dashboard',
      icon: <LayoutDashboard className="w-5 h-5" />,
      label: t('sidebar.dashboard'),
      action: () => setViewMode('dashboard'),
      active: viewMode === 'dashboard',
    },
    {
      id: 'requirements',
      icon: <FileStack className="w-5 h-5" />,
      label: t('sidebar.requirements'),
      action: () => setViewMode('requirements'),
      active: viewMode === 'requirements',
    },
    {
      id: 'agents',
      icon: <Bot className="w-5 h-5" />,
      label: t('sidebar.agents'),
      action: () => setViewMode('agents'),
      active: viewMode === 'agents',
    },
    {
      id: 'search',
      icon: <Search className="w-5 h-5" />,
      label: t('command.title'),
      action: () => setCommandPaletteOpen(true),
    },
    {
      id: 'settings',
      icon: <Settings className="w-5 h-5" />,
      label: t('settings.title'),
      action: () => setSettingsOpen(true),
    },
  ] : globalItems

  // Requirement detail context: add quick "New Req" and "Run Analysis"
  const reqDetailItems: DockItem[] = activeRequirementId ? [
    {
      id: 'home',
      icon: <Home className="w-5 h-5" />,
      label: t('breadcrumb.home'),
      action: () => setActiveWorkspace(null),
    },
    {
      id: 'req-list',
      icon: <FileStack className="w-5 h-5" />,
      label: t('view.requirements'),
      action: () => setViewMode('requirements'),
      active: false,
    },
    {
      id: 'ai-summary',
      icon: <Sparkles className="w-5 h-5" />,
      label: t('requirement.aiSummary'),
      action: () => {
        const { sendNLPMessageStream } = useWorkspaceStore.getState()
        if (nlpContext) {
          sendNLPMessageStream(`请总结「${nlpContext.requirementTitle}」的当前进展，包括各阶段完成情况和下一步建议。`)
        }
      },
      accent: true,
    },
    {
      id: 'search',
      icon: <Search className="w-5 h-5" />,
      label: t('command.title'),
      action: () => setCommandPaletteOpen(true),
    },
    {
      id: 'settings',
      icon: <Settings className="w-5 h-5" />,
      label: t('settings.title'),
      action: () => setSettingsOpen(true),
    },
  ] : workspaceItems

  const items = activeRequirementId ? reqDetailItems : workspaceItems

  // Clear StatusBar (h-7) + CommandBar (form + margins); extra offset when NLP context pill is shown
  const dockBottom = nlpContext ? 'bottom-[148px]' : 'bottom-[104px]'

  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.5, duration: 0.4 }}
      className={`fixed right-4 z-50 flex flex-col items-end gap-1.5 ${dockBottom}`}
    >
      <AnimatePresence mode="wait">
        {dockVisible ? (
          <motion.div
            key="dock-expanded"
            initial={{ x: 12, opacity: 0, scale: 0.95 }}
            animate={{ x: 0, opacity: 1, scale: 1 }}
            exit={{ x: 12, opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="flex flex-col items-center gap-1 px-2 py-2.5 rounded-2xl bg-surface-1/85 backdrop-blur-xl border border-border-subtle shadow-2xl shadow-black/30"
          >
            {items.map((item) => (
              <motion.button
                key={item.id}
                onClick={item.action}
                whileHover={{ scale: 1.18, x: -4 }}
                whileTap={{ scale: 0.9 }}
                className={`relative w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer transition-colors group ${
                  item.accent
                    ? 'bg-accent text-white hover:bg-accent/90'
                    : item.active
                    ? 'bg-accent/15 text-accent'
                    : 'text-text-tertiary hover:text-text-primary hover:bg-surface-3/60'
                }`}
                title={item.label}
              >
                {item.icon}

                {/* Tooltip on left side */}
                <div className="absolute right-full mr-2.5 px-2 py-1 rounded-lg bg-surface-3 border border-border-subtle text-[10px] font-medium text-text-primary whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg">
                  {item.label}
                </div>

                {item.active && !item.accent && (
                  <motion.div
                    layoutId="dock-dot"
                    className="absolute -right-0.5 w-1 h-1 rounded-full bg-accent"
                  />
                )}
              </motion.button>
            ))}

            {/* Collapse button */}
            <motion.button
              onClick={toggleDock}
              whileHover={{ scale: 1.15 }}
              whileTap={{ scale: 0.9 }}
              className="w-7 h-7 mt-0.5 rounded-lg flex items-center justify-center cursor-pointer text-text-tertiary/40 hover:text-text-secondary hover:bg-surface-3/60 transition-colors"
            >
              <ChevronDown className="w-3.5 h-3.5 rotate-90" />
            </motion.button>
          </motion.div>
        ) : (
          <motion.button
            key="dock-collapsed"
            initial={{ x: 8, opacity: 0, scale: 0.9 }}
            animate={{ x: 0, opacity: 1, scale: 1 }}
            exit={{ x: 8, opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onClick={toggleDock}
            whileHover={{ scale: 1.1, x: -2 }}
            whileTap={{ scale: 0.95 }}
            className="px-3 py-2 rounded-xl bg-surface-1/80 backdrop-blur-xl border border-border-subtle shadow-lg shadow-black/20 cursor-pointer flex items-center gap-1.5 text-text-tertiary hover:text-text-secondary transition-colors"
          >
            <ChevronUp className="w-3 h-3 -rotate-90" />
            <span className="text-[10px] font-medium">{t('layout.dock')}</span>
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
