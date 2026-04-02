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
import Sidebar, { SIDEBAR_WIDTH_COLLAPSED, SIDEBAR_WIDTH_EXPANDED } from './components/Sidebar'
import CommandPalette from './components/CommandPalette'
import SettingsPanel from './components/SettingsPanel'
import TaskDetail from './components/TaskDetail'
import ToastContainer from './components/ui/Toast'
import ConfirmDialog from './components/ui/ConfirmDialog'
import AgentChat from './components/AgentChat'
import WorkspaceTemplates from './components/WorkspaceTemplates'
import ShortcutsOverlay from './components/ShortcutsOverlay'
import Dock from './components/Dock'
import LoginPage from './components/LoginPage'

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
    sidebarCollapsed,
  } = useUIStore()
  const { locale } = useI18nStore()
  const restoreSession = useAuthStore((s) => s.restoreSession)
  const authToken = useAuthStore((s) => s.token)
  const authChecked = useAuthStore((s) => s.checked)

  const fetchWorkspaces = useWorkspaceStore((s) => s.fetchWorkspaces)
  const refreshActiveWorkspace = useWorkspaceStore((s) => s.refreshActiveWorkspace)

  useEffect(() => {
    restoreSession()
  }, [restoreSession])

  useEffect(() => {
    fetchWorkspaces().then(() => {
      const state = useWorkspaceStore.getState()
      const { activeWorkspaceId, workspaces, setActiveWorkspace } = state
      if (activeWorkspaceId) {
        const exists = workspaces.some((w) => w.id === activeWorkspaceId)
        if (!exists) {
          setActiveWorkspace(null)
          useUIStore.getState().addToast({
            type: 'info',
            message: 'Previous workspace is no longer available.',
          })
        } else {
          refreshActiveWorkspace()
        }
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

  if (!authChecked) {
    return <div className="h-screen flex items-center justify-center bg-surface-0" />
  }

  if (!authToken) {
    return <LoginPage />
  }

  return (
    <div className="h-screen flex flex-col bg-surface-0 overflow-hidden">
      <TitleBar />
      <WorkspaceTabs />

      <div className="relative flex-1 flex flex-col min-h-0 overflow-hidden">
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

                  {/* ConversationThread: floats above content */}
                  <div className="pointer-events-none absolute inset-x-0 bottom-16 z-20 flex justify-center px-6 pb-2 sm:px-10">
                    <div className="pointer-events-auto w-full max-w-2xl">
                      <ConversationThread
                        context="workspace"
                        workspaceId={activeWorkspaceId ?? undefined}
                        onDismiss={() => useWorkspaceStore.getState().clearWorkspaceConversation()}
                      />
                    </div>
                  </div>
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

        <motion.div
          className="pointer-events-none absolute bottom-0 right-0 z-30 flex justify-center px-6 pb-2 pt-1 sm:px-10"
          initial={false}
          animate={{
            left: activeWorkspaceId
              ? sidebarCollapsed
                ? SIDEBAR_WIDTH_COLLAPSED
                : SIDEBAR_WIDTH_EXPANDED
              : 0,
          }}
          transition={{
            type: 'spring',
            stiffness: 420,
            damping: 34,
            mass: 0.9,
          }}
        >
          <div className="pointer-events-auto w-full max-w-2xl">
            <CommandBar />
          </div>
        </motion.div>
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
