import {
  PanelLeftClose, PanelLeftOpen,
  LayoutDashboard, FileStack,
  GitBranch, Bot, Puzzle,
  Layers, Zap, Gauge,
  Settings,
} from 'lucide-react'
import { motion } from 'framer-motion'
import * as Tooltip from '@radix-ui/react-tooltip'
import { useWorkspaceStore } from '../stores/workspace'
import { useUIStore } from '../stores/ui'
import { useT } from '../i18n'
import type { TranslationKey } from '../i18n/en'

type ViewMode =
  | 'dashboard'
  | 'requirements'
  | 'pipeline'
  | 'agentTeam'
  | 'extensions'
  | 'controlCenter'
  | 'context'
  | 'execution'
  | 'budget'
  | 'settings'

type NavItem = {
  key: ViewMode
  icon: typeof LayoutDashboard
  label: TranslationKey
}

type NavGroup = {
  groupLabel?: TranslationKey
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { key: 'dashboard', icon: LayoutDashboard, label: 'sidebar.dashboard' },
      { key: 'requirements', icon: FileStack, label: 'sidebar.requirements' },
    ],
  },
  {
    groupLabel: 'sidebar.group.orchestration',
    items: [
      { key: 'agentTeam', icon: Bot, label: 'sidebar.agentTeam' },
      { key: 'pipeline', icon: GitBranch, label: 'sidebar.orchestrationGraph' },
    ],
  },
  {
    groupLabel: 'sidebar.group.intelligence',
    items: [
      { key: 'execution', icon: Zap, label: 'sidebar.execution' },
      { key: 'context', icon: Layers, label: 'sidebar.context' },
      { key: 'extensions', icon: Puzzle, label: 'sidebar.extensions' },
      { key: 'budget', icon: Gauge, label: 'sidebar.budget' },
    ],
  },
]

const SETTINGS_ITEM: NavItem = { key: 'settings', icon: Settings, label: 'sidebar.settings' }

function NavButton({
  item,
  isActive,
  collapsed,
  onClick,
}: {
  item: NavItem
  isActive: boolean
  collapsed: boolean
  onClick: () => void
}) {
  const t = useT()
  const Icon = item.icon

  const btn = (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 rounded-lg transition-all cursor-pointer
        ${collapsed ? 'justify-center w-8 h-8 mx-auto' : 'px-2.5 py-[7px]'}
        ${isActive
          ? 'bg-accent/12 text-accent'
          : 'text-text-tertiary hover:text-text-primary hover:bg-surface-2'
        }`}
    >
      <Icon className={`shrink-0 ${isActive ? 'opacity-100' : 'opacity-70'} ${collapsed ? 'w-[15px] h-[15px]' : 'w-[14px] h-[14px]'}`} />
      {!collapsed && (
        <span className="flex-1 text-left truncate text-[12px] font-medium">{t(item.label)}</span>
      )}
      {!collapsed && isActive && (
        <span className="w-1 h-1 rounded-full bg-accent shrink-0" />
      )}
    </button>
  )

  if (!collapsed) return btn

  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{btn}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="right"
          sideOffset={10}
          className="px-2.5 py-1.5 text-[11px] font-medium text-text-primary bg-surface-3 border border-border-default rounded-lg shadow-lg z-[300] select-none"
        >
          {t(item.label)}
          <Tooltip.Arrow className="fill-surface-3" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

export default function Sidebar() {
  const { activeWorkspaceId, workspaces, setActiveRequirement } = useWorkspaceStore()
  const { sidebarCollapsed, toggleSidebar, viewMode, setViewMode } = useUIStore()
  const t = useT()

  const workspace = workspaces.find(w => w.id === activeWorkspaceId)
  if (!workspace) return null

  function handleNav(key: ViewMode) {
    setViewMode(key)
    if (key !== 'requirements') setActiveRequirement(null)
  }

  const collapsed = sidebarCollapsed

  return (
    <Tooltip.Provider delayDuration={300}>
      <div className="flex shrink-0 flex-col self-stretch min-h-0">
        <motion.aside
          initial={false}
          animate={{ width: collapsed ? 48 : 200 }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          className="flex-1 min-h-0 flex flex-col py-3 overflow-hidden border-r border-border-subtle bg-surface-1/40"
        >
        {/* Collapse toggle */}
        <div className={`flex mb-3 ${collapsed ? 'justify-center px-0' : 'justify-end px-3'}`}>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button
                onClick={toggleSidebar}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-text-tertiary hover:text-text-secondary hover:bg-surface-3 transition-all cursor-pointer"
              >
                {collapsed
                  ? <PanelLeftOpen className="w-[14px] h-[14px]" />
                  : <PanelLeftClose className="w-[14px] h-[14px]" />
                }
              </button>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                side="right"
                sideOffset={10}
                className="px-2.5 py-1.5 text-[11px] font-medium text-text-primary bg-surface-3 border border-border-default rounded-lg shadow-lg z-[300] select-none"
              >
                {t(collapsed ? 'sidebar.expand' : 'sidebar.expand')}
                <Tooltip.Arrow className="fill-surface-3" />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        </div>

        {/* Nav groups */}
        <nav className={`flex-1 min-h-0 flex flex-col gap-1 overflow-y-auto ${collapsed ? 'px-1' : 'px-2'}`}>
          {NAV_GROUPS.map((group, gi) => (
            <div key={gi}>
              {/* Group divider + label */}
              {gi > 0 && (
                <div className={`${collapsed ? 'my-2 mx-auto w-5' : 'my-2'} flex items-center gap-2`}>
                  <div className="flex-1 h-px bg-border-subtle" />
                  {!collapsed && group.groupLabel && (
                    <span className="text-[9px] font-semibold uppercase tracking-widest text-text-tertiary/60 whitespace-nowrap">
                      {t(group.groupLabel)}
                    </span>
                  )}
                  {!collapsed && <div className="flex-1 h-px bg-border-subtle" />}
                </div>
              )}

              <div className={`flex flex-col ${collapsed ? 'items-center gap-0.5' : 'gap-0.5'}`}>
                {group.items.map(item => (
                  <NavButton
                    key={item.key}
                    item={item}
                    isActive={viewMode === item.key}
                    collapsed={collapsed}
                    onClick={() => handleNav(item.key)}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Settings pinned at bottom */}
        <div className={`shrink-0 pt-2 border-t border-border-subtle ${collapsed ? 'px-1' : 'px-2'}`}>
          <NavButton
            item={SETTINGS_ITEM}
            isActive={viewMode === 'settings'}
            collapsed={collapsed}
            onClick={() => handleNav('settings')}
          />
        </div>
        </motion.aside>
      </div>
    </Tooltip.Provider>
  )
}
