import { Settings, Languages, ChevronRight, Home } from 'lucide-react'
import { motion } from 'framer-motion'
import * as Tooltip from '@radix-ui/react-tooltip'
import { useWorkspaceStore } from '../stores/workspace'
import { useAuthStore } from '../stores/auth'
import { useUIStore } from '../stores/ui'
import { useI18nStore, useT } from '../i18n'
import NotificationPanel from './NotificationPanel'
import type { TranslationKey } from '../i18n/en'
import { preventMouseDownFocus } from '../lib/preventMouseFocus'

function userAvatarLabel(user: { name: string; email: string } | null): string {
  if (!user) return 'U'
  const n = user.name?.trim()
  if (n) {
    if (/[\u4e00-\u9fff]/.test(n)) return n[0]
    const parts = n.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
    return n.slice(0, 2).toUpperCase()
  }
  const e = user.email?.trim()
  return e ? e[0].toUpperCase() : 'U'
}

export default function TitleBar() {
  const t = useT()
  const { activeWorkspaceId, activePhaseId, workspaces, setActiveWorkspace, setActivePhase } = useWorkspaceStore()
  const { setSettingsOpen } = useUIStore()
  const { locale, toggleLocale } = useI18nStore()
  const user = useAuthStore((s) => s.user)
  const workspace = workspaces.find((w) => w.id === activeWorkspaceId)
  const phase = workspace?.phases.find((p) => p.id === activePhaseId)

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

        {/* Breadcrumb navigation */}
        <nav
          className="flex items-center gap-1.5"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {workspace ? (
            <>
              <button
                type="button"
                onMouseDown={preventMouseDownFocus}
                onClick={() => setActiveWorkspace(null)}
                className="flex items-center gap-1 text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1"
              >
                <Home className="w-3.5 h-3.5" />
                <span className="text-xs font-medium hidden sm:inline">{t('breadcrumb.home')}</span>
              </button>
              <ChevronRight className="w-3 h-3 text-text-tertiary/40" />
              <button
                type="button"
                onMouseDown={preventMouseDownFocus}
                onClick={() => setActivePhase(null)}
                className="text-sm font-semibold tracking-tight text-text-primary hover:text-accent transition-colors cursor-pointer rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1"
              >
                Vibe<span className="text-accent">OS</span>
                <span className="text-text-tertiary text-xs mx-1.5">/</span>
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-text-secondary font-medium">
                  {workspace.name || t('workspace.untitled')}
                </motion.span>
              </button>
              {phase && (
                <>
                  <ChevronRight className="w-3 h-3 text-text-tertiary/40" />
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-xs text-text-tertiary font-medium"
                  >
                    {t(`phase.${phase.type}` as TranslationKey)}
                  </motion.span>
                </>
              )}
            </>
          ) : (
            <span className="text-sm font-semibold tracking-tight text-text-primary">
              Vibe<span className="text-accent">OS</span>
            </span>
          )}
        </nav>
      </div>

      <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          type="button"
          onMouseDown={preventMouseDownFocus}
          onClick={toggleLocale}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-text-tertiary hover:text-text-secondary hover:bg-surface-3 transition-all cursor-pointer text-[11px] font-mono outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1"
        >
          <Languages className="w-3.5 h-3.5" />
          {locale === 'en' ? '中文' : 'EN'}
        </button>
        <NotificationPanel />
        <button
          type="button"
          onMouseDown={preventMouseDownFocus}
          onClick={() => setSettingsOpen(true)}
          className="p-2 rounded-lg text-text-tertiary hover:text-text-secondary hover:bg-surface-3 transition-all cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1"
        >
          <Settings className="w-4 h-4" />
        </button>
        <Tooltip.Provider delayDuration={200}>
          {user ? (
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button
                  type="button"
                  onMouseDown={preventMouseDownFocus}
                  aria-label={`${user.name?.trim() || user.email}, ${user.email}`}
                  className="ml-2 w-7 h-7 rounded-full bg-gradient-to-br from-accent to-violet-500 flex items-center justify-center text-xs font-semibold text-white shrink-0 outline-none cursor-default focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1"
                >
                  {userAvatarLabel(user)}
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  side="bottom"
                  align="end"
                  sideOffset={8}
                  className="z-[400] max-w-[min(280px,calc(100vw-2rem))] rounded-lg border border-border-default bg-surface-3 px-3 py-2.5 shadow-lg select-none"
                >
                  <div className="flex flex-col gap-1 text-left">
                    {user.name?.trim() ? (
                      <span className="text-xs font-semibold text-text-primary leading-tight">
                        {user.name.trim()}
                      </span>
                    ) : null}
                    <span className="text-[11px] font-mono text-text-secondary leading-snug break-all">
                      {user.email}
                    </span>
                  </div>
                  <Tooltip.Arrow className="fill-surface-3" />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          ) : (
            <div className="ml-2 w-7 h-7 rounded-full bg-gradient-to-br from-accent to-violet-500 flex items-center justify-center text-xs font-semibold text-white shrink-0">
              {userAvatarLabel(null)}
            </div>
          )}
        </Tooltip.Provider>
      </div>
    </header>
  )
}
