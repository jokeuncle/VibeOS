import { create } from 'zustand'
import type { WorkspaceState } from './types'

export type { LogEntry, AgentStatusEvent } from './types'
export type { WorkspaceState } from './types'

import { buildCoreSlice } from './slices/coreSlice'
import { buildTasksSlice } from './slices/tasksSlice'
import { buildChatSlice } from './slices/chatSlice'
import { buildLogsSlice } from './slices/logsSlice'
import { buildWorkflowSlice } from './slices/workflowSlice'
import { buildRequirementsSlice } from './slices/requirementsSlice'

export const useWorkspaceStore = create<WorkspaceState>()((set, get) => ({
  ...buildCoreSlice(set, get),
  ...buildTasksSlice(set, get),
  ...buildChatSlice(set, get),
  ...buildLogsSlice(set, get),
  ...buildWorkflowSlice(set, get),
  ...buildRequirementsSlice(set, get),
}))
