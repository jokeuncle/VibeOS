import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useWorkspaceStore } from './stores/workspace'
import { useUIStore } from './stores/ui'
import TitleBar from './components/TitleBar'
import StatusBar from './components/StatusBar'
import CommandBar from './components/CommandBar'
import WorkspaceHome from './components/WorkspaceHome'
import WorkspaceView from './components/WorkspaceView'
import WorkspaceTabs from './components/WorkspaceTabs'
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
  const { toggleSidebar, setSettingsOpen, theme, addTab, shortcutsOpen, setShortcutsOpen, commandPaletteOpen, settingsOpen } = useUIStore()

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    if (activeWorkspaceId) addTab(activeWorkspaceId)
  }, [activeWorkspaceId, addTab])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault()
        toggleSidebar()
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
  }, [toggleSidebar, setSettingsOpen, shortcutsOpen, setShortcutsOpen, commandPaletteOpen, settingsOpen])

  return (
    <div className="h-screen flex flex-col bg-surface-0 overflow-hidden">
      <TitleBar />
      <WorkspaceTabs />

      <div className="flex-1 flex flex-col overflow-hidden">
        <AnimatePresence mode="wait">
          {activeWorkspaceId ? (
            <motion.div
              key="workspace"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="flex-1 flex flex-col overflow-hidden"
            >
              <WorkspaceView />
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

        <CommandBar />
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
