import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useWorkspaceStore } from './stores/workspace'
import { useUIStore } from './stores/ui'
import TitleBar from './components/TitleBar'
import StatusBar from './components/StatusBar'
import CommandBar from './components/CommandBar'
import WorkspaceHome from './components/WorkspaceHome'
import WorkspaceView from './components/WorkspaceView'
import CommandPalette from './components/CommandPalette'
import SettingsPanel from './components/SettingsPanel'
import TaskDetail from './components/TaskDetail'
import ToastContainer from './components/ui/Toast'

export default function App() {
  const { activeWorkspaceId } = useWorkspaceStore()
  const { toggleSidebar, setSettingsOpen } = useUIStore()

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault()
        toggleSidebar()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleSidebar, setSettingsOpen])

  return (
    <div className="h-screen flex flex-col bg-surface-0 overflow-hidden">
      <TitleBar />

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

      <StatusBar />

      {/* Global overlays */}
      <CommandPalette />
      <SettingsPanel />
      <TaskDetail />
      <ToastContainer />
    </div>
  )
}
