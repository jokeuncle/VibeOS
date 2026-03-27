import { ArrowLeft, Settings, Languages } from 'lucide-react'
import { motion } from 'framer-motion'
import { useWorkspaceStore } from '../stores/workspace'
import { useUIStore } from '../stores/ui'
import { useI18nStore } from '../i18n'
import NotificationPanel from './NotificationPanel'

export default function TitleBar() {
  const { activeWorkspaceId, workspaces, setActiveWorkspace } = useWorkspaceStore()
  const { setSettingsOpen } = useUIStore()
  const { locale, toggleLocale } = useI18nStore()
  const workspace = workspaces.find((w) => w.id === activeWorkspaceId)

  return (
    <header
      className="h-12 flex items-center justify-between px-5 border-b border-border-subtle bg-surface-1/80 glass z-50 relative"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 mr-2">
          <div className="w-3 h-3 rounded-full bg-[#ff5f57] opacity-80 hover:opacity-100 transition-opacity" />
          <div className="w-3 h-3 rounded-full bg-[#febc2e] opacity-80 hover:opacity-100 transition-opacity" />
          <div className="w-3 h-3 rounded-full bg-[#28c840] opacity-80 hover:opacity-100 transition-opacity" />
        </div>

        {workspace && (
          <motion.button
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={() => setActiveWorkspace(null)}
            className="flex items-center gap-1.5 text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <ArrowLeft className="w-4 h-4" />
          </motion.button>
        )}

        <div className="flex items-center gap-2.5">
          <span className="text-sm font-semibold tracking-tight text-text-primary">
            Vibe<span className="text-accent">OS</span>
          </span>
          {workspace && (
            <>
              <span className="text-text-tertiary text-xs">/</span>
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-sm text-text-secondary font-medium"
              >
                {workspace.name}
              </motion.span>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          onClick={toggleLocale}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-text-tertiary hover:text-text-secondary hover:bg-surface-3 transition-all cursor-pointer text-[11px] font-mono"
        >
          <Languages className="w-3.5 h-3.5" />
          {locale === 'en' ? '中文' : 'EN'}
        </button>
        <NotificationPanel />
        <button
          onClick={() => setSettingsOpen(true)}
          className="p-2 rounded-lg text-text-tertiary hover:text-text-secondary hover:bg-surface-3 transition-all cursor-pointer"
        >
          <Settings className="w-4 h-4" />
        </button>
        <div className="ml-2 w-7 h-7 rounded-full bg-gradient-to-br from-accent to-violet-500 flex items-center justify-center text-xs font-semibold text-white">
          U
        </div>
      </div>
    </header>
  )
}
