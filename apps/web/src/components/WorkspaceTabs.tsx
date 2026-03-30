import { X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useWorkspaceStore } from '../stores/workspace'
import { useUIStore } from '../stores/ui'
import { useT } from '../i18n'
import { WORKSPACE_TAB_DOT, WORKSPACE_TAB_TOP, workspaceColorFallback } from '../lib/workspaceColors'

export default function WorkspaceTabs() {
  const t = useT()
  const { workspaces, activeWorkspaceId, setActiveWorkspace } = useWorkspaceStore()
  const { openTabs, removeTab } = useUIStore()

  if (openTabs.length <= 1) return null

  return (
    <div className="h-8 flex items-end px-2 bg-surface-0 border-b border-border-subtle overflow-x-auto shrink-0">
      <AnimatePresence>
        {openTabs.map((tabId) => {
          const ws = workspaces.find((w) => w.id === tabId)
          if (!ws) return null
          const isActive = tabId === activeWorkspaceId
          const wc = workspaceColorFallback(ws.color)
          return (
            <motion.div
              key={tabId}
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.15 }}
              className={`relative flex items-center gap-1.5 px-3 h-7 text-[11px] font-medium cursor-pointer rounded-t-md transition-colors shrink-0 ${
                isActive
                  ? `bg-surface-1 text-text-primary ${WORKSPACE_TAB_TOP[wc]}`
                  : 'bg-surface-0 text-text-tertiary border-t-2 border-t-transparent hover:text-text-secondary hover:bg-surface-1/50'
              }`}
              onClick={() => setActiveWorkspace(tabId)}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${WORKSPACE_TAB_DOT[wc]}`}
                aria-hidden
              />
              <span className="truncate max-w-[120px]">{ws.name || t('workspace.untitled')}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  removeTab(tabId)
                  if (isActive) {
                    const remaining = openTabs.filter((id) => id !== tabId)
                    setActiveWorkspace(remaining.length > 0 ? remaining[remaining.length - 1] : null)
                  }
                }}
                className="p-0.5 rounded hover:bg-surface-3 text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer"
                title={t('tabs.close')}
              >
                <X className="w-3 h-3" />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
