import { motion, AnimatePresence } from 'framer-motion'
import { Bell, Check } from 'lucide-react'
import { useRef, useEffect } from 'react'
import { useUIStore } from '../stores/ui'
import { useWorkspaceStore } from '../stores/workspace'
import { useT } from '../i18n'
import type { TranslationKey } from '../i18n/en'

function timeAgo(dateStr: string, t: (k: TranslationKey) => string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return t('time.justNow')
  if (mins < 60) return `${mins}${t('time.mAgo')}`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}${t('time.hAgo')}`
  return `${Math.floor(hrs / 24)}${t('time.dAgo')}`
}

export default function NotificationPanel() {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)
  const { notificationsOpen, setNotificationsOpen, notifications, markNotificationRead, markAllRead } = useUIStore()
  const { setActiveWorkspace } = useWorkspaceStore()
  const unreadCount = notifications.filter((n) => !n.read).length

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setNotificationsOpen(false)
      }
    }
    if (notificationsOpen) window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [notificationsOpen, setNotificationsOpen])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setNotificationsOpen(!notificationsOpen)}
        className="p-2 rounded-lg text-text-tertiary hover:text-text-secondary hover:bg-surface-3 transition-all cursor-pointer relative"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-accent" />
        )}
      </button>

      <AnimatePresence>
        {notificationsOpen && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full right-0 mt-1 w-80 rounded-xl border border-border-default bg-surface-2 shadow-xl shadow-black/30 z-[55] overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
              <span className="text-xs font-semibold text-text-primary">
                {t('notification.title')}
                {unreadCount > 0 && (
                  <span className="ml-1.5 text-[10px] font-mono text-accent bg-accent/10 px-1.5 py-0.5 rounded-full">
                    {unreadCount}
                  </span>
                )}
              </span>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-[10px] text-accent hover:text-accent-hover cursor-pointer font-medium"
                >
                  {t('notification.markAllRead')}
                </button>
              )}
            </div>

            <div className="max-h-64 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="py-8 text-center text-xs text-text-tertiary">
                  {t('notification.empty')}
                </div>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => {
                      markNotificationRead(n.id)
                      if (n.workspaceId) {
                        setActiveWorkspace(n.workspaceId)
                        setNotificationsOpen(false)
                      }
                    }}
                    className={`w-full text-left px-4 py-3 flex gap-3 cursor-pointer transition-colors hover:bg-surface-3 ${
                      n.read ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">
                      {n.read ? (
                        <Check className="w-3.5 h-3.5 text-text-tertiary" />
                      ) : (
                        <div className="w-2 h-2 rounded-full bg-accent mt-1" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-text-primary leading-relaxed">{n.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-text-tertiary">{n.description}</span>
                        <span className="text-[10px] text-text-tertiary/50">{timeAgo(n.time, t)}</span>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
