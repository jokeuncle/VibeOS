import { motion, AnimatePresence } from 'framer-motion'
import { X, Command } from 'lucide-react'
import { useEffect } from 'react'
import { useUIStore } from '../stores/ui'
import { useI18nStore, useT } from '../i18n'

const SHORTCUTS = [
  { keys: ['⌘', 'K'], action: 'settings.shortcut.commandPalette' },
  { keys: ['⌘', 'B'], action: 'settings.shortcut.toggleSidebar' },
  { keys: ['⌘', ','], action: 'settings.shortcut.settings' },
  { keys: ['Esc'], action: 'settings.shortcut.close' },
] as const

export default function SettingsPanel() {
  const t = useT()
  const { settingsOpen, setSettingsOpen } = useUIStore()
  const { locale, setLocale } = useI18nStore()

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSettingsOpen(false)
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault()
        setSettingsOpen(!settingsOpen)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [settingsOpen, setSettingsOpen])

  return (
    <AnimatePresence>
      {settingsOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-[80]"
            onClick={() => setSettingsOpen(false)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md z-[81] rounded-2xl border border-border-default bg-surface-1 shadow-2xl shadow-black/40 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 h-14 border-b border-border-subtle">
              <h3 className="text-sm font-semibold text-text-primary">{t('settings.title')}</h3>
              <button
                onClick={() => setSettingsOpen(false)}
                className="p-1.5 rounded-lg text-text-tertiary hover:text-text-secondary hover:bg-surface-3 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-6 max-h-[60vh] overflow-y-auto">
              {/* Language */}
              <div>
                <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">
                  {t('settings.language')}
                </h4>
                <p className="text-xs text-text-tertiary mb-3">{t('settings.languageDesc')}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setLocale('en')}
                    className={`px-4 py-2 rounded-lg text-xs font-medium border cursor-pointer transition-all ${
                      locale === 'en'
                        ? 'border-accent/30 bg-accent/10 text-accent'
                        : 'border-border-subtle bg-surface-2 text-text-tertiary hover:bg-surface-3'
                    }`}
                  >
                    English
                  </button>
                  <button
                    onClick={() => setLocale('zh')}
                    className={`px-4 py-2 rounded-lg text-xs font-medium border cursor-pointer transition-all ${
                      locale === 'zh'
                        ? 'border-accent/30 bg-accent/10 text-accent'
                        : 'border-border-subtle bg-surface-2 text-text-tertiary hover:bg-surface-3'
                    }`}
                  >
                    中文
                  </button>
                </div>
              </div>

              {/* Shortcuts */}
              <div>
                <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">
                  {t('settings.shortcuts')}
                </h4>
                <div className="space-y-2">
                  {SHORTCUTS.map((s) => (
                    <div
                      key={s.action}
                      className="flex items-center justify-between py-2 px-3 rounded-lg bg-surface-2/50"
                    >
                      <span className="text-xs text-text-secondary">
                        {t(s.action as any)}
                      </span>
                      <div className="flex items-center gap-1">
                        {s.keys.map((key) => (
                          <kbd
                            key={key}
                            className="min-w-[24px] h-6 flex items-center justify-center px-1.5 text-[10px] font-mono text-text-tertiary bg-surface-3 rounded-md border border-border-subtle"
                          >
                            {key === '⌘' ? <Command className="w-2.5 h-2.5" /> : key}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* About */}
              <div>
                <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">
                  {t('settings.about')}
                </h4>
                <div className="py-3 px-3 rounded-lg bg-surface-2/50">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-text-primary">
                      Any<span className="text-accent">OS</span>
                    </span>
                  </div>
                  <span className="text-[11px] text-text-tertiary font-mono">
                    {t('settings.version')} 0.1.0
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
