import { motion, AnimatePresence } from 'framer-motion'
import { X, Command } from 'lucide-react'
import { useEffect } from 'react'
import { useUIStore } from '../stores/ui'
import { useT } from '../i18n'
import type { TranslationKey } from '../i18n/en'

interface ShortcutItem {
  keys: string[]
  labelKey: TranslationKey
}
interface ShortcutSection {
  titleKey: TranslationKey
  items: ShortcutItem[]
}

const SECTIONS: ShortcutSection[] = [
  {
    titleKey: 'shortcuts.general',
    items: [
      { keys: ['⌘', 'K'], labelKey: 'shortcuts.commandPalette' },
      { keys: ['⌘', 'B'], labelKey: 'shortcuts.toggleSidebar' },
      { keys: ['⌘', ','], labelKey: 'shortcuts.settings' },
      { keys: ['?'], labelKey: 'shortcuts.shortcuts' },
    ],
  },
  {
    titleKey: 'shortcuts.navigation',
    items: [
      { keys: ['Esc'], labelKey: 'shortcuts.close' },
      { keys: ['⌘', '←'], labelKey: 'shortcuts.goHome' },
    ],
  },
]

export default function ShortcutsOverlay() {
  const t = useT()
  const { shortcutsOpen, setShortcutsOpen } = useUIStore()

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && shortcutsOpen) setShortcutsOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shortcutsOpen, setShortcutsOpen])

  return (
    <AnimatePresence>
      {shortcutsOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-[85]"
            onClick={() => setShortcutsOpen(false)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm z-[86] rounded-2xl border border-border-default bg-surface-1 shadow-2xl shadow-black/40 overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 h-12 border-b border-border-subtle">
              <h3 className="text-sm font-semibold text-text-primary">{t('shortcuts.title')}</h3>
              <button
                onClick={() => setShortcutsOpen(false)}
                className="p-1.5 rounded-lg text-text-tertiary hover:text-text-secondary hover:bg-surface-3 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {SECTIONS.map((section) => (
                <div key={section.titleKey}>
                  <h4 className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">
                    {t(section.titleKey)}
                  </h4>
                  <div className="space-y-1.5">
                    {section.items.map((item) => (
                      <div
                        key={item.labelKey}
                        className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-surface-2/50"
                      >
                        <span className="text-xs text-text-secondary">
                          {t(item.labelKey)}
                        </span>
                        <div className="flex items-center gap-1">
                          {item.keys.map((key) => (
                            <kbd
                              key={key}
                              className="min-w-[22px] h-5 flex items-center justify-center px-1.5 text-[10px] font-mono text-text-tertiary bg-surface-3 rounded-md border border-border-subtle"
                            >
                              {key === '⌘' ? <Command className="w-2.5 h-2.5" /> : key}
                            </kbd>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
