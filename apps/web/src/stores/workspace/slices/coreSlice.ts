import type { StoreApi } from 'zustand'
import type { Workspace } from '../../../types'
import { workspaceApi } from '../../../lib/api'
import { patchWorkspace } from '../helpers'
import type { CoreSlice, WorkspaceState } from '../types'

type SetState = StoreApi<WorkspaceState>['setState']
type GetState = StoreApi<WorkspaceState>['getState']

export function buildCoreSlice(set: SetState, get: GetState) {
  return {
    workspaces: [] as Workspace[],
    activeWorkspaceId: null as string | null,
    activePhaseId: null as string | null,
    loading: false,

    fetchWorkspaces: async () => {
      set({ loading: true })
      try {
        const list = await workspaceApi.list()
        set({ workspaces: list, loading: false })
      } catch (err) {
        console.error('Failed to fetch workspaces:', err)
        set({ loading: false })
      }
    },

    /** Single GET /workspaces/:id — updates phases, requirements, agents; keeps existing activity list & executions. */
    refreshWorkspaceDocument: async () => {
      const id = get().activeWorkspaceId
      if (!id || id.startsWith('ws-temp-')) return
      try {
        const ws = await workspaceApi.get(id)
        if (get().activeWorkspaceId !== id) return
        set((s) => {
          const prev = s.workspaces.find((w) => w.id === id)
          const liveAgentStatus = new Map(
            (prev?.agents ?? [])
              .filter((a) => a.status !== 'idle')
              .map((a) => [a.type, { status: a.status }]),
          )
          const mergedAgents = (ws.agents || []).map((a: any) => {
            const live = liveAgentStatus.get(a.type)
            return live ? { ...a, ...live } : a
          })
          const merged = {
            ...ws,
            activities: prev?.activities?.length ? prev.activities : ws.activities ?? [],
            agents: mergedAgents,
          }
          if (!prev) {
            return { workspaces: [...s.workspaces, merged] }
          }
          return { workspaces: patchWorkspace(s.workspaces, id, () => merged) }
        })
      } catch (err) {
        console.error('Failed to refresh workspace document:', err)
      }
    },

    refreshActiveWorkspace: async () => {
      const id = get().activeWorkspaceId
      if (!id) return
      try {
        const [ws, actResp] = await Promise.all([
          workspaceApi.get(id),
          workspaceApi.listActivities(id, 1, 50),
          get().fetchExecutions(),
        ])
        if (get().activeWorkspaceId !== id) return
        const activities = (actResp.data || []).map((a: any) => ({
          id: a.id,
          type: a.type,
          description: a.description,
          timestamp: a.timestamp || a.createdAt,
          agentType: a.agentType,
        }))
        set((s) => {
          const prev = s.workspaces.find((w) => w.id === id)
          const liveAgentStatus = new Map(
            (prev?.agents ?? [])
              .filter((a) => a.status !== 'idle')
              .map((a) => [a.type, { status: a.status }]),
          )
          const mergedAgents = (ws.agents || []).map((a: any) => {
            const live = liveAgentStatus.get(a.type)
            return live ? { ...a, ...live } : a
          })
          const merged = { ...ws, activities, agents: mergedAgents }
          if (!prev) {
            return { workspaces: [...s.workspaces, merged] }
          }
          return { workspaces: patchWorkspace(s.workspaces, id, () => merged) }
        })
      } catch (err) {
        console.error('Failed to refresh workspace:', err)
      }
    },

    setActiveWorkspace: (id: string | null) => {
      set({
        activeWorkspaceId: id,
        activePhaseId: null,
        messages: [],
        workflowEvents: [],
        messagesCursor: null,
        messagesHasMore: false,
      })
      if (id && !id.startsWith('ws-temp-')) {
        void get().refreshActiveWorkspace()
        void get().fetchWorkspaceMessages()
      }
    },

    setActivePhase: (phaseId: string | null) => set({ activePhaseId: phaseId }),

    createWorkspace: () => {
      const tempId = `ws-temp-${Date.now()}`

      workspaceApi
        .create('Untitled Workspace', '', 'indigo')
        .then((ws) => {
          set((s) => ({
            workspaces: patchWorkspace(s.workspaces, tempId, () => ws),
            activeWorkspaceId:
              s.activeWorkspaceId === tempId ? ws.id : s.activeWorkspaceId,
          }))
        })
        .catch((err) => {
          console.error('Failed to create workspace:', err)
          set((s) => ({
            workspaces: s.workspaces.filter((w) => w.id !== tempId),
          }))
        })

      const placeholder: Workspace = {
        id: tempId,
        name: 'Untitled Workspace',
        description: '',
        progress: 0,
        currentPhaseId: null,
        color: 'indigo',
        status: 'active',
        phases: [],
        agents: [],
        activities: [],
        repos: [],
        requirements: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      set((s) => ({ workspaces: [...s.workspaces, placeholder] }))
      return tempId
    },

    updateWorkspace: (wsId: string, updates: Partial<Pick<Workspace, 'name' | 'description'>>) => {
      const prev = get().workspaces.find((w) => w.id === wsId)
      set((s) => ({
        workspaces: patchWorkspace(s.workspaces, wsId, (w) => ({
          ...w,
          ...updates,
          updatedAt: new Date().toISOString(),
        })),
      }))
      workspaceApi.update(wsId, updates).catch((err) => {
        console.error('Failed to update workspace:', err)
        if (prev) {
          set((s) => ({ workspaces: patchWorkspace(s.workspaces, wsId, () => prev) }))
        }
      })
    },

    deleteWorkspace: (wsId: string) => {
      const prev = get().workspaces
      set((s) => ({
        workspaces: s.workspaces.filter((w) => w.id !== wsId),
        activeWorkspaceId: s.activeWorkspaceId === wsId ? null : s.activeWorkspaceId,
      }))
      workspaceApi.delete(wsId).catch((err) => {
        console.error('Failed to delete workspace:', err)
        set({ workspaces: prev })
      })
    },

    createWorkspaceFromTemplate: (name: string, description: string, color: Workspace['color']) => {
      const tempId = `ws-temp-${Date.now()}`

      workspaceApi
        .create(name, description, color)
        .then((ws) => {
          set((s) => ({
            workspaces: patchWorkspace(s.workspaces, tempId, () => ws),
            activeWorkspaceId:
              s.activeWorkspaceId === tempId ? ws.id : s.activeWorkspaceId,
          }))
        })
        .catch((err) => {
          console.error('Failed to create workspace:', err)
          set((s) => ({
            workspaces: s.workspaces.filter((w) => w.id !== tempId),
          }))
        })

      const placeholder: Workspace = {
        id: tempId,
        name,
        description,
        color,
        progress: 0,
        currentPhaseId: null,
        status: 'active',
        phases: [],
        agents: [],
        activities: [],
        repos: [],
        requirements: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      set((s) => ({ workspaces: [...s.workspaces, placeholder] }))
      return tempId
    },

    archiveWorkspace: (wsId: string) => {
      workspaceApi
        .archiveWorkspace(wsId)
        .then(() => {
          set((s) => ({
            workspaces: patchWorkspace(s.workspaces, wsId, (w) => ({ ...w, status: 'archived' })),
          }))
        })
        .catch((err) => console.error('Failed to archive workspace:', err))
    },

    unarchiveWorkspace: (wsId: string) => {
      workspaceApi
        .unarchiveWorkspace(wsId)
        .then(() => {
          set((s) => ({
            workspaces: patchWorkspace(s.workspaces, wsId, (w) => ({ ...w, status: 'active' })),
          }))
        })
        .catch((err) => console.error('Failed to unarchive workspace:', err))
    },

    resetWorkspacePhases: async (wsId: string) => {
      try {
        await workspaceApi.resetWorkspacePhases(wsId)
        await get().refreshActiveWorkspace()
        const reqId = get().activeRequirementId
        if (reqId) get().loadRequirementDetail(wsId, reqId)
      } catch (e) {
        console.error('Failed to reset workspace phases:', e)
        throw e
      }
    },

    addRepo: (wsId: string, repo: import('../../../types').WorkspaceRepo) =>
      set((s) => ({
        workspaces: patchWorkspace(s.workspaces, wsId, (w) => ({
          ...w,
          repos: [...(w.repos ?? []), repo],
        })),
      })),

    removeRepo: (wsId: string, repoId: string) =>
      set((s) => ({
        workspaces: patchWorkspace(s.workspaces, wsId, (w) => ({
          ...w,
          repos: (w.repos ?? []).filter((r) => r.id !== repoId),
        })),
      })),

    updateRepoInStore: (wsId: string, repo: import('../../../types').WorkspaceRepo) =>
      set((s) => ({
        workspaces: patchWorkspace(s.workspaces, wsId, (w) => ({
          ...w,
          repos: (w.repos ?? []).map((r) => (r.id === repo.id ? repo : r)),
        })),
      })),
  } satisfies CoreSlice
}
