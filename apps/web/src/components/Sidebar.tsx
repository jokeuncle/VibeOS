import {
  PanelLeftClose, PanelLeftOpen, LayoutDashboard, FileStack,
  Settings, Library, Brain, Share2,
} from 'lucide-react'
import { motion } from 'framer-motion'
import * as Tooltip from '@radix-ui/react-tooltip'
import { useWorkspaceStore } from '../stores/workspace'
import { useUIStore } from '../stores/ui'
import { useT } from '../i18n'
import type { TranslationKey } from '../i18n/en'

type SidebarSection =
  | 'dashboard'
  | 'requirements'
  | 'knowledgeBase'
  | 'projectMemory'
  | 'techKnowledge'
  | 'settings'

const SECTIONS: { key: SidebarSection; icon: typeof LayoutDashboard; label: TranslationKey }[] = [
  { key: 'dashboard', icon: LayoutDashboard, label: 'sidebar.dashboard' },
  { key: 'requirements', icon: FileStack, label: 'sidebar.requirements' },
  { key: 'knowledgeBase', icon: Library, label: 'sidebar.knowledgeBase' },
  { key: 'projectMemory', icon: Brain, label: 'sidebar.projectMemory' },
  { key: 'techKnowledge', icon: Share2, label: 'sidebar.techKnowledge' },
  { key: 'settings', icon: Settings, label: 'sidebar.settings' },
]

export default function Sidebar() {
  const { activeWorkspaceId, workspaces, setActiveRequirement } = useWorkspaceStore()
  const { sidebarCollapsed, toggleSidebar, viewMode, setViewMode } = useUIStore()
  const t = useT()

  const workspace = workspaces.find(w => w.id === activeWorkspaceId)
  if (!workspace) return null

  function handleSectionClick(key: SidebarSection) {
    setViewMode(key)
    if (key !== 'requirements') setActiveRequirement(null)
  }

  if (sidebarCollapsed) {
    return (
      <Tooltip.Provider delayDuration={400}>
        <motion.aside
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0, width: 48 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="border-r border-border-subtle bg-surface-1/50 flex flex-col py-3 overflow-hidden shrink-0"
        >
          <div className="flex items-center justify-center mb-3">
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button
                  onClick={toggleSidebar}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-text-tertiary hover:text-text-secondary hover:bg-surface-3 transition-all cursor-pointer"
                >
                  <PanelLeftOpen className="w-4 h-4" />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  side="right"
                  sideOffset={8}
                  className="px-2.5 py-1.5 text-[11px] font-medium text-text-primary bg-surface-3 border border-border-default rounded-lg shadow-lg z-[300] select-none"
                >
                  {t('sidebar.expand' as TranslationKey)}
                  <Tooltip.Arrow className="fill-surface-3" />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          </div>

          <div className="flex flex-col items-center gap-1">
            {SECTIONS.map(({ key, icon: Icon, label }) => {
              const isActive = viewMode === key
              return (
                <Tooltip.Root key={key}>
                  <Tooltip.Trigger asChild>
                    <button
                      onClick={() => handleSectionClick(key)}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                        isActive ? 'bg-accent/15 text-accent' : 'text-text-tertiary hover:text-text-secondary hover:bg-surface-3'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </button>
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content
                      side="right"
                      sideOffset={8}
                      className="px-2.5 py-1.5 text-[11px] font-medium text-text-primary bg-surface-3 border border-border-default rounded-lg shadow-lg z-[300] select-none"
                    >
                      {t(label)}
                      <Tooltip.Arrow className="fill-surface-3" />
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
              )
            })}
          </div>
        </motion.aside>
      </Tooltip.Provider>
    )
  }

  return (
    <motion.aside
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0, width: 200 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="border-r border-border-subtle bg-surface-1/50 flex flex-col py-3 overflow-hidden shrink-0"
    >
      <div className="flex items-center justify-end px-3 mb-3">
        <button
          onClick={toggleSidebar}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-text-tertiary hover:text-text-secondary hover:bg-surface-3 transition-all cursor-pointer"
        >
          <PanelLeftClose className="w-4 h-4" />
        </button>
      </div>

      <nav className="flex-1 px-2 space-y-0.5">
        {SECTIONS.map(({ key, icon: Icon, label }) => {
          const isActive = viewMode === key
          return (
            <button
              key={key}
              onClick={() => handleSectionClick(key)}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[12px] font-medium transition-all cursor-pointer ${
                isActive
                  ? 'bg-accent/10 text-accent'
                  : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="flex-1 text-left truncate">{t(label)}</span>
            </button>
          )
        })}
      </nav>
    </motion.aside>
  )
}
