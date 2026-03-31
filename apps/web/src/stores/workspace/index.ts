import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { WorkspaceState } from './types'

export type { AgentStatusEvent } from './types'
export type { WorkspaceState } from './types'

import { buildCoreSlice } from './slices/coreSlice'
import { buildTasksSlice } from './slices/tasksSlice'
import { buildChatSlice } from './slices/chatSlice'
import { buildWorkflowSlice } from './slices/workflowSlice'
import { buildRequirementsSlice } from './slices/requirementsSlice'
import { buildExecutionSlice } from './slices/executionSlice'

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      ...buildCoreSlice(set, get),
      ...buildTasksSlice(set, get),
      ...buildChatSlice(set, get),
      ...buildWorkflowSlice(set, get),
      ...buildRequirementsSlice(set, get),
      ...buildExecutionSlice(set, get),
    }),
    {
      name: 'vibeos-workspace',
      partialize: (state) => ({ activeWorkspaceId: state.activeWorkspaceId }),
    },
  ),
)
