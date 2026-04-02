import type { StoreApi } from 'zustand'
import { workspaceApi } from '../../../lib/api'
import { patchWorkspace } from '../helpers'
import type { WorkspaceState } from '../types'

type SetState = StoreApi<WorkspaceState>['setState']
type GetState = StoreApi<WorkspaceState>['getState']

export function buildRequirementsSlice(set: SetState, get: GetState) {
  return {
    activeRequirementId: null as string | null,
    requirementDetail: null as import('../../../types').Requirement | null,

    setActiveRequirement: (id: string | null) => {
      set({ activeRequirementId: id, requirementDetail: null })
      if (id) {
        const wsId = get().activeWorkspaceId
        if (wsId) get().loadRequirementDetail(wsId, id)
      }
    },

    loadRequirementDetail: async (wsId: string, reqId: string) => {
      try {
        const detail = await workspaceApi.getRequirement(wsId, reqId)
        set({ requirementDetail: detail })
      } catch (e) {
        console.error('Failed to load requirement detail:', e)
      }
    },

    createRequirement: async (wsId: string, title: string, description: string) => {
      try {
        const req = await workspaceApi.createRequirement(wsId, { title, description })
        set((s) => ({
          workspaces: patchWorkspace(s.workspaces, wsId, (w) => ({
            ...w,
            requirements: [...(w.requirements ?? []), req],
          })),
        }))
        // Auto-navigate to the new requirement detail
        get().setActiveRequirement(req.id)
      } catch (e) {
        console.error('Failed to create requirement:', e)
        get().refreshActiveWorkspace()
      }
    },

    updateRequirement: async (wsId: string, reqId: string, updates: Parameters<WorkspaceState['updateRequirement']>[2]) => {
      const prevWorkspaces = get().workspaces
      set((s) => ({
        workspaces: patchWorkspace(s.workspaces, wsId, (w) => ({
          ...w,
          requirements: (w.requirements ?? []).map((r) =>
            r.id === reqId
              ? {
                  ...r,
                  ...updates,
                  status: (updates.status as import('../../../types').RequirementStatus | undefined) ?? r.status,
                  currentPhase: (updates.currentPhase as import('../../../types').PhaseType | undefined) ?? r.currentPhase,
                  priority: (updates.priority as import('../../../types').TaskPriority | undefined) ?? r.priority,
                  updatedAt: new Date().toISOString(),
                }
              : r,
          ),
        })),
      }))
      try {
        const updated = await workspaceApi.updateRequirement(wsId, reqId, updates)
        set((s) => ({
          workspaces: patchWorkspace(s.workspaces, wsId, (w) => ({
            ...w,
            requirements: (w.requirements ?? []).map((r) => (r.id === reqId ? updated : r)),
          })),
          requirementDetail: s.activeRequirementId === reqId ? updated : s.requirementDetail,
        }))
      } catch (e) {
        console.error('Failed to update requirement:', e)
        set({ workspaces: prevWorkspaces })
      }
    },

    deleteRequirement: async (wsId: string, reqId: string) => {
      try {
        await workspaceApi.deleteRequirement(wsId, reqId)
        if (get().activeRequirementId === reqId) {
          set({ activeRequirementId: null, requirementDetail: null })
        }
        get().refreshActiveWorkspace()
      } catch (e) {
        console.error('Failed to delete requirement:', e)
      }
    },

    resetRequirementPhase: async (reqId: string, phaseType: string) => {
      const wsId = get().activeWorkspaceId
      if (!wsId) return
      try {
        await workspaceApi.resetRequirementPhase(wsId, reqId, phaseType)
        get().refreshActiveWorkspace()
        if (get().activeRequirementId === reqId) {
          get().loadRequirementDetail(wsId, reqId)
        }
      } catch (e) {
        console.error('Failed to reset requirement phase:', e)
      }
    },

    patchRequirementStatus: (wsId: string, reqId: string, status: string) => {
      set((s) => ({
        workspaces: patchWorkspace(s.workspaces, wsId, (w) => ({
          ...w,
          requirements: (w.requirements ?? []).map((r) =>
            r.id === reqId ? { ...r, status: status as import('../../../types').RequirementStatus } : r,
          ),
        })),
        requirementDetail:
          s.requirementDetail?.id === reqId
            ? { ...s.requirementDetail, status: status as import('../../../types').RequirementStatus }
            : s.requirementDetail,
      }))
    },
  } satisfies Pick<
    WorkspaceState,
    | 'activeRequirementId'
    | 'requirementDetail'
    | 'setActiveRequirement'
    | 'loadRequirementDetail'
    | 'createRequirement'
    | 'updateRequirement'
    | 'deleteRequirement'
    | 'resetRequirementPhase'
    | 'patchRequirementStatus'
  >
}
