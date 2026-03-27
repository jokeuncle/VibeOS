import { create } from 'zustand'

export interface Toast {
  id: string
  type: 'success' | 'error' | 'info'
  message: string
}

export interface Notification {
  id: string
  title: string
  description: string
  time: string
  read: boolean
}

const MOCK_NOTIFICATIONS: Notification[] = [
  { id: 'n1', title: 'Arch Agent completed database schema design', description: 'User Points System', time: '2026-03-27T14:20:00Z', read: false },
  { id: 'n2', title: 'Requirements phase completed', description: 'User Points System', time: '2026-03-27T12:00:00Z', read: false },
  { id: 'n3', title: 'New workspace created', description: 'Payment Gateway', time: '2026-03-25T09:00:00Z', read: true },
]

interface UIState {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void

  commandPaletteOpen: boolean
  setCommandPaletteOpen: (open: boolean) => void

  taskDetailOpen: boolean
  taskDetailPhaseId: string | null
  taskDetailTaskId: string | null
  openTaskDetail: (phaseId: string, taskId: string) => void
  closeTaskDetail: () => void

  settingsOpen: boolean
  setSettingsOpen: (open: boolean) => void

  notificationsOpen: boolean
  setNotificationsOpen: (open: boolean) => void

  sidebarCollapsed: boolean
  toggleSidebar: () => void

  viewMode: 'list' | 'board'
  setViewMode: (mode: 'list' | 'board') => void

  notifications: Notification[]
  markNotificationRead: (id: string) => void
  markAllRead: () => void
}

export const useUIStore = create<UIState>((set) => ({
  toasts: [],
  addToast: (toast) => {
    const id = `toast-${Date.now()}`
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, 3000)
  },
  removeToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  commandPaletteOpen: false,
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

  taskDetailOpen: false,
  taskDetailPhaseId: null,
  taskDetailTaskId: null,
  openTaskDetail: (phaseId, taskId) =>
    set({ taskDetailOpen: true, taskDetailPhaseId: phaseId, taskDetailTaskId: taskId }),
  closeTaskDetail: () =>
    set({ taskDetailOpen: false, taskDetailPhaseId: null, taskDetailTaskId: null }),

  settingsOpen: false,
  setSettingsOpen: (open) => set({ settingsOpen: open }),

  notificationsOpen: false,
  setNotificationsOpen: (open) => set({ notificationsOpen: open }),

  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  viewMode: 'list',
  setViewMode: (mode) => set({ viewMode: mode }),

  notifications: MOCK_NOTIFICATIONS,
  markNotificationRead: (id) =>
    set((s) => ({
      notifications: s.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n,
      ),
    })),
  markAllRead: () =>
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, read: true })),
    })),
}))
