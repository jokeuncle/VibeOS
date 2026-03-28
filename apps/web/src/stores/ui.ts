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
  workspaceId?: string
}

export interface ConfirmDialogState {
  title: string
  message: string
  danger: boolean
  onConfirm: () => void
}

const MOCK_NOTIFICATIONS: Notification[] = [
  { id: 'n1', title: 'Arch Agent completed database schema design', description: 'User Points System', time: '2026-03-27T14:20:00Z', read: false, workspaceId: 'ws-1' },
  { id: 'n2', title: 'Requirements phase completed', description: 'User Points System', time: '2026-03-27T12:00:00Z', read: false, workspaceId: 'ws-1' },
  { id: 'n3', title: 'New workspace created', description: 'Payment Gateway', time: '2026-03-25T09:00:00Z', read: true, workspaceId: 'ws-2' },
]

interface UIState {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void

  confirmDialog: ConfirmDialogState | null
  showConfirm: (opts: { title: string; message: string; danger?: boolean; onConfirm: () => void }) => void
  hideConfirm: () => void

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

  viewMode: 'list' | 'board' | 'dashboard' | 'agents'
  setViewMode: (mode: 'list' | 'board' | 'dashboard' | 'agents') => void

  splitMode: boolean
  splitSecondaryView: 'list' | 'board' | 'dashboard' | 'agents'
  toggleSplitMode: () => void
  setSplitSecondaryView: (mode: 'list' | 'board' | 'dashboard' | 'agents') => void

  notifications: Notification[]
  markNotificationRead: (id: string) => void
  markAllRead: () => void

  agentChatOpen: boolean
  agentChatAgentId: string | null
  openAgentChat: (agentId: string) => void
  closeAgentChat: () => void

  homeSearchQuery: string
  setHomeSearchQuery: (query: string) => void

  templatePickerOpen: boolean
  setTemplatePickerOpen: (open: boolean) => void

  theme: 'dark' | 'light'
  setTheme: (theme: 'dark' | 'light') => void

  openTabs: string[]
  addTab: (id: string) => void
  removeTab: (id: string) => void

  shortcutsOpen: boolean
  setShortcutsOpen: (open: boolean) => void

  closeTopmostOverlay: () => boolean
}

export const useUIStore = create<UIState>((set, get) => ({
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

  confirmDialog: null,
  showConfirm: (opts) =>
    set({ confirmDialog: { danger: false, ...opts } }),
  hideConfirm: () =>
    set({ confirmDialog: null }),

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

  splitMode: false,
  splitSecondaryView: 'board',
  toggleSplitMode: () => set((s) => ({ splitMode: !s.splitMode })),
  setSplitSecondaryView: (mode) => set({ splitSecondaryView: mode }),

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

  agentChatOpen: false,
  agentChatAgentId: null,
  openAgentChat: (agentId) =>
    set({ agentChatOpen: true, agentChatAgentId: agentId }),
  closeAgentChat: () =>
    set({ agentChatOpen: false, agentChatAgentId: null }),

  homeSearchQuery: '',
  setHomeSearchQuery: (query) => set({ homeSearchQuery: query }),

  templatePickerOpen: false,
  setTemplatePickerOpen: (open) => set({ templatePickerOpen: open }),

  theme: (localStorage.getItem('anyos-theme') as 'dark' | 'light') || 'dark',
  setTheme: (theme) => {
    localStorage.setItem('anyos-theme', theme)
    set({ theme })
  },

  openTabs: [],
  addTab: (id) =>
    set((s) => ({
      openTabs: s.openTabs.includes(id) ? s.openTabs : [...s.openTabs, id],
    })),
  removeTab: (id) =>
    set((s) => ({
      openTabs: s.openTabs.filter((t) => t !== id),
    })),

  shortcutsOpen: false,
  setShortcutsOpen: (open) => set({ shortcutsOpen: open }),

  closeTopmostOverlay: () => {
    const s = get()
    if (s.shortcutsOpen) { set({ shortcutsOpen: false }); return true }
    if (s.commandPaletteOpen) { set({ commandPaletteOpen: false }); return true }
    if (s.settingsOpen) { set({ settingsOpen: false }); return true }
    if (s.templatePickerOpen) { set({ templatePickerOpen: false }); return true }
    if (s.taskDetailOpen) { set({ taskDetailOpen: false, taskDetailPhaseId: null, taskDetailTaskId: null }); return true }
    if (s.agentChatOpen) { set({ agentChatOpen: false, agentChatAgentId: null }); return true }
    if (s.notificationsOpen) { set({ notificationsOpen: false }); return true }
    return false
  },
}))
