import { create } from 'zustand'
import type { ConversationContext } from '../types'

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

// No mock data — notifications are generated from real WebSocket events

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

  viewMode:
    | 'dashboard'
    | 'requirements'
    | 'pipeline'
    | 'agentTeam'
    | 'integrations'
    | 'controlCenter'
    | 'context'
    | 'traces'
    | 'budget'
    | 'settings'
  setViewMode: (
    mode:
      | 'dashboard'
      | 'requirements'
      | 'pipeline'
      | 'agentTeam'
      | 'integrations'
      | 'controlCenter'
      | 'context'
      | 'traces'
      | 'budget'
      | 'settings',
  ) => void

  reqSubView: 'list' | 'kanban' | 'graph'
  setReqSubView: (sub: 'list' | 'kanban' | 'graph') => void

  reqCreating: boolean
  setReqCreating: (v: boolean) => void

  notifications: Notification[]
  addNotification: (n: Omit<Notification, 'id' | 'read'>) => void
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

  dockVisible: boolean
  toggleDock: () => void

  nlpContext: {
    requirementId: string
    requirementTitle: string
    phaseType: string | null
    agentType: string | null
  } | null
  setNlpContext: (ctx: {
    requirementId: string
    requirementTitle: string
    phaseType?: string | null
    agentType?: string | null
  } | null) => void

  conversationVisible: Record<string, boolean>
  setConversationVisible: (ctx: ConversationContext, visible: boolean) => void

  conversationCollapsed: Record<string, boolean>
  setConversationCollapsed: (ctx: ConversationContext, collapsed: boolean) => void
  toggleConversation: (ctx: ConversationContext) => void

  // WebSocket connection status
  wsConnected: boolean
  setWsConnected: (connected: boolean) => void

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

  viewMode: 'requirements',
  setViewMode: (mode) => set({ viewMode: mode }),

  reqSubView: 'list',
  setReqSubView: (sub) => set({ reqSubView: sub }),

  reqCreating: false,
  setReqCreating: (v) => set({ reqCreating: v }),

  notifications: [],
  addNotification: (n) =>
    set((s) => ({
      notifications: [
        { ...n, id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, read: false },
        ...s.notifications,
      ].slice(0, 50),
    })),
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

  dockVisible: true,
  toggleDock: () => set((s) => ({ dockVisible: !s.dockVisible })),

  nlpContext: null,
  setNlpContext: (ctx) => set({
    nlpContext: ctx ? {
      requirementId: ctx.requirementId,
      requirementTitle: ctx.requirementTitle,
      phaseType: ctx.phaseType ?? null,
      agentType: ctx.agentType ?? null,
    } : null,
  }),

  conversationVisible: {},
  setConversationVisible: (ctx, visible) =>
    set((s) => ({ conversationVisible: { ...s.conversationVisible, [ctx]: visible } })),

  conversationCollapsed: {},
  setConversationCollapsed: (ctx, collapsed) =>
    set((s) => ({ conversationCollapsed: { ...s.conversationCollapsed, [ctx]: collapsed } })),
  toggleConversation: (ctx) =>
    set((s) => ({ conversationCollapsed: { ...s.conversationCollapsed, [ctx]: !s.conversationCollapsed[ctx] } })),

  // WebSocket connection status
  wsConnected: false,
  setWsConnected: (connected) => set({ wsConnected: connected }),

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
