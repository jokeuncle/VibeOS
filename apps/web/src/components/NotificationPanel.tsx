import { motion, AnimatePresence } from 'framer-motion'
import { Bell, Check, CheckCircle2, XCircle } from 'lucide-react'
import { useRef, useEffect, useCallback, useState } from 'react'
import { useUIStore } from '../stores/ui'
import { useWorkspaceStore } from '../stores/workspace'
import { approvalApi } from '../lib/api'
import { useT } from '../i18n'
import type { TranslationKey } from '../i18n/en'
import { preventMouseDownFocus } from '../lib/preventMouseFocus'

function timeAgo(dateStr: string, t: (k: TranslationKey) => string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return t('time.justNow')
  if (mins < 60) return `${mins}${t('time.mAgo')}`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}${t('time.hAgo')}`
  return `${Math.floor(hrs / 24)}${t('time.dAgo')}`
}

function NotificationItem({
  notification: n,
  onRead,
  t,
}: {
  notification: import('../stores/ui').Notification
  onRead: () => void
  t: (k: TranslationKey) => string
}) {
  const [resolving, setResolving] = useState(false)
  const [resolved, setResolved] = useState<'approved' | 'rejected' | null>(null)
  const { addToast } = useUIStore()

  const handleResolve = useCallback(
    async (approved: boolean, e: React.MouseEvent) => {
      e.stopPropagation()
      if (!n.approvalKey || resolving) return
      setResolving(true)
      try {
        await approvalApi.resolve(n.approvalKey, approved)
        setResolved(approved ? 'approved' : 'rejected')
        addToast({
          type: approved ? 'success' : 'info',
          message: approved ? 'Approved successfully' : 'Rejected',
        })
      } catch {
        addToast({ type: 'error', message: 'Failed to resolve approval' })
      } finally {
        setResolving(false)
      }
    },
    [n.approvalKey, resolving, addToast],
  )

  return (
    <button
      onClick={onRead}
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

        {n.approvalKey && !resolved && (
          <div className="flex gap-2 mt-2">
            <button
              disabled={resolving}
              onClick={(e) => handleResolve(true, e)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-success/15 text-success text-[10px] font-medium hover:bg-success/25 transition-colors disabled:opacity-50"
            >
              <CheckCircle2 className="w-3 h-3" />
              {t('common.approve' as TranslationKey)}
            </button>
            <button
              disabled={resolving}
              onClick={(e) => handleResolve(false, e)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-danger/15 text-danger text-[10px] font-medium hover:bg-danger/25 transition-colors disabled:opacity-50"
            >
              <XCircle className="w-3 h-3" />
              {t('common.reject' as TranslationKey)}
            </button>
          </div>
        )}

        {resolved && (
          <div className={`mt-2 text-[10px] font-medium ${resolved === 'approved' ? 'text-success' : 'text-danger'}`}>
            {resolved === 'approved' ? '✓ Approved' : '✗ Rejected'}
          </div>
        )}
      </div>
    </button>
  )
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
        type="button"
        onMouseDown={preventMouseDownFocus}
        onClick={() => setNotificationsOpen(!notificationsOpen)}
        className="p-2 rounded-lg text-text-tertiary hover:text-text-secondary hover:bg-surface-3 transition-all cursor-pointer relative outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1"
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
                  <NotificationItem
                    key={n.id}
                    notification={n}
                    onRead={() => {
                      markNotificationRead(n.id)
                      if (n.workspaceId) {
                        setActiveWorkspace(n.workspaceId)
                        setNotificationsOpen(false)
                      }
                    }}
                    t={t}
                  />
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
