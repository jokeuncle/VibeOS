import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useWorkspaceStore } from './stores/workspace'
import { useUIStore } from './stores/ui'
import { useAuthStore } from './stores/auth'
import { connectWebSocket, disconnectWebSocket } from './lib/ws'
import { useI18nStore } from './i18n'
import TitleBar from './components/TitleBar'
import StatusBar from './components/StatusBar'
import CommandBar from './components/CommandBar'
import WorkspaceHome from './components/WorkspaceHome'
import ConversationThread from './components/ConversationThread'
import WorkspaceView from './components/WorkspaceView'
import WorkspaceTabs from './components/WorkspaceTabs'
import Sidebar from './components/Sidebar'
import CommandPalette from './components/CommandPalette'
import SettingsPanel from './components/SettingsPanel'
import TaskDetail from './components/TaskDetail'
import ToastContainer from './components/ui/Toast'
import ConfirmDialog from './components/ui/ConfirmDialog'
import AgentChat from './components/AgentChat'
import WorkspaceTemplates from './components/WorkspaceTemplates'
import ShortcutsOverlay from './components/ShortcutsOverlay'
import Dock from './components/Dock'

export default function App() {
  const { activeWorkspaceId } = useWorkspaceStore()
  const {
    toggleSidebar,
    setSettingsOpen,
    theme,
    addTab,
    shortcutsOpen,
    setShortcutsOpen,
    commandPaletteOpen,
    settingsOpen,
  } = useUIStore()
  const { locale } = useI18nStore()
  const restoreSession = useAuthStore((s) => s.restoreSession)

  const fetchWorkspaces = useWorkspaceStore((s) => s.fetchWorkspaces)
  const refreshActiveWorkspace = useWorkspaceStore((s) => s.refreshActiveWorkspace)

  useEffect(() => {
    restoreSession()
  }, [restoreSession])

  useEffect(() => {
    fetchWorkspaces().then(() => {
      if (useWorkspaceStore.getState().activeWorkspaceId) {
        refreshActiveWorkspace()
      }
    })
    return () => disconnectWebSocket()
  }, [fetchWorkspaces, refreshActiveWorkspace])

  useEffect(() => {
    connectWebSocket(activeWorkspaceId)
  }, [activeWorkspaceId])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
  }, [locale])

  useEffect(() => {
    if (activeWorkspaceId) addTab(activeWorkspaceId)
  }, [activeWorkspaceId, addTab])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        useUIStore.getState().closeTopmostOverlay()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault()
        toggleSidebar()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault()
        setSettingsOpen(!settingsOpen)
        return
      }
      if (e.key === '?' && !commandPaletteOpen && !settingsOpen) {
        const target = e.target as HTMLElement
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
        e.preventDefault()
        setShortcutsOpen(!shortcutsOpen)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleSidebar, setSettingsOpen, settingsOpen, shortcutsOpen, setShortcutsOpen, commandPaletteOpen])

  return (
    <div className="h-screen flex flex-col bg-surface-0 overflow-hidden">
      <TitleBar />
      <WorkspaceTabs />

      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <AnimatePresence mode="wait">
          {activeWorkspaceId ? (
            <motion.div
              key="workspace"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="flex min-h-0 flex-1 basis-0 overflow-hidden"
            >
              <Sidebar />

              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
                  <WorkspaceView />

                  <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-6 pb-3 sm:px-10 sm:pb-4">
                    <div className="pointer-events-auto w-full max-w-2xl">
                      <ConversationThread
                        context="workspace"
                        workspaceId={activeWorkspaceId ?? undefined}
                        onDismiss={() => useWorkspaceStore.getState().clearWorkspaceConversation()}
                      />
                    </div>
                  </div>
                </div>

                <div className="shrink-0 bg-gradient-to-t from-surface-0 via-surface-0/95 to-transparent px-6 pb-3 pt-4 sm:px-10">
                  <CommandBar />
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="home"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="flex-1 flex flex-col overflow-hidden"
            >
              <WorkspaceHome />
            </motion.div>
          )}
        </AnimatePresence>

        {!activeWorkspaceId && (
          <div className="shrink-0 px-6 pb-3 sm:px-10 sm:pb-4">
            <CommandBar />
          </div>
        )}
      </div>

      <Dock />
      <StatusBar />

      {/* Global overlays */}
      <CommandPalette />
      <SettingsPanel />
      <TaskDetail />
      <AgentChat />
      <WorkspaceTemplates />
      <ShortcutsOverlay />
      <ConfirmDialog />
      <ToastContainer />
    </div>
  )
}
