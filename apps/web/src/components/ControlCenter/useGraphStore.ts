import { create } from 'zustand'
import type { Node, Edge, OnNodesChange, OnEdgesChange, Connection } from '@xyflow/react'
import { applyNodeChanges, applyEdgeChanges, addEdge } from '@xyflow/react'
import { workspaceGraphApi } from '../../lib/api'
import type { WorkspaceGraph } from '../../lib/api'

export interface GraphNodeData {
  label: string
  nodeType: 'capability' | 'llm_call' | 'human_in_loop' | 'condition' | 'subgraph' | 'intent' | 'agentic'
  capabilityRef?: string
  config: Record<string, unknown>
  [key: string]: unknown
}

export interface StateField {
  name: string
  type: string
  reducer: string
  default?: unknown
}

export interface GraphTemplate {
  id: string
  intentPattern: string
  handlerType: string
}

interface GraphState {
  nodes: Node<GraphNodeData>[]
  edges: Edge[]
  selectedNodeId: string | null
  selectedEdgeId: string | null
  dirty: boolean
  templateId: string | null
  graphName: string
  graphDescription: string
  stateSchema: StateField[]
  graphConfig: Record<string, unknown>
  templates: GraphTemplate[]
  running: boolean
  executionLog: { category: string; action: string; data: Record<string, unknown> }[]

  workspaceId: string | null
  graphId: string | null
  workspaceGraphs: WorkspaceGraph[]
  loadingGraph: boolean
  _pendingLoad: { wsId: string; graphId: string } | null

  onNodesChange: OnNodesChange
  onEdgesChange: OnEdgesChange
  onConnect: (connection: Connection) => void
  setNodes: (nodes: Node<GraphNodeData>[]) => void
  setEdges: (edges: Edge[]) => void
  addNode: (node: Node<GraphNodeData>) => void
  removeNode: (id: string) => void
  selectNode: (id: string | null) => void
  selectEdge: (id: string | null) => void
  updateNodeData: (id: string, data: Partial<GraphNodeData>) => void
  updateEdgeData: (id: string, data: Record<string, unknown>) => void
  setGraphName: (name: string) => void
  setGraphDescription: (desc: string) => void
  setStateSchema: (schema: StateField[]) => void
  setGraphConfig: (config: Record<string, unknown>) => void
  setTemplateId: (id: string | null) => void
  setTemplates: (templates: GraphTemplate[]) => void
  setDirty: (dirty: boolean) => void
  setRunning: (running: boolean) => void
  addExecutionEvent: (event: { category: string; action: string; data: Record<string, unknown> }) => void
  clearExecutionLog: () => void
  reset: () => void

  setWorkspaceId: (id: string | null) => void
  setGraphId: (id: string | null) => void
  /** Schedule a graph to be loaded when ControlCenter mounts (from Agent Team etc.) */
  requestLoadGraph: (wsId: string, graphId: string) => void
  consumePendingLoad: () => { wsId: string; graphId: string } | null
  loadWorkspaceGraphs: (wsId: string) => Promise<void>
  loadWorkspaceGraph: (wsId: string, graphId?: string) => Promise<void>
  loadDefaultGraph: (wsId: string, phaseType: string) => Promise<void>
  saveToWorkspace: (wsId: string) => Promise<void>
  cloneTemplate: (wsId: string, templateId: string, name: string) => Promise<void>

  toGraphDef: () => Record<string, unknown>
  loadGraphDef: (def: Record<string, unknown>) => void
}

const initialState = {
  nodes: [] as Node<GraphNodeData>[],
  edges: [] as Edge[],
  selectedNodeId: null as string | null,
  selectedEdgeId: null as string | null,
  dirty: false,
  templateId: null as string | null,
  graphName: '',
  graphDescription: '',
  stateSchema: [] as StateField[],
  graphConfig: { checkpointer: 'memory', recursion_limit: 25 } as Record<string, unknown>,
  templates: [] as GraphTemplate[],
  running: false,
  executionLog: [] as { category: string; action: string; data: Record<string, unknown> }[],
  workspaceId: null as string | null,
  graphId: null as string | null,
  workspaceGraphs: [] as WorkspaceGraph[],
  loadingGraph: false,
  _pendingLoad: null as { wsId: string; graphId: string } | null,
}

export const useGraphStore = create<GraphState>((set, get) => ({
  ...initialState,

  onNodesChange: (changes) =>
    set((s) => ({ nodes: applyNodeChanges(changes, s.nodes) as Node<GraphNodeData>[], dirty: true })),

  onEdgesChange: (changes) =>
    set((s) => ({ edges: applyEdgeChanges(changes, s.edges), dirty: true })),

  onConnect: (connection) =>
    set((s) => ({
      edges: addEdge({ ...connection, type: 'smoothstep', animated: true }, s.edges),
      dirty: true,
    })),

  setNodes: (nodes) => set({ nodes, dirty: true }),
  setEdges: (edges) => set({ edges, dirty: true }),

  addNode: (node) =>
    set((s) => ({ nodes: [...s.nodes, node], dirty: true })),

  removeNode: (id) =>
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      edges: s.edges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
      dirty: true,
    })),

  selectNode: (id) => set({ selectedNodeId: id, selectedEdgeId: null }),
  selectEdge: (id) => set({ selectedEdgeId: id, selectedNodeId: null }),

  updateNodeData: (id, data) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...data } } : n,
      ),
      dirty: true,
    })),

  updateEdgeData: (id, data) =>
    set((s) => ({
      edges: s.edges.map((e) =>
        e.id === id ? { ...e, data: { ...e.data, ...data } } : e,
      ),
      dirty: true,
    })),

  setGraphName: (graphName) => set({ graphName, dirty: true }),
  setGraphDescription: (graphDescription) => set({ graphDescription, dirty: true }),
  setStateSchema: (stateSchema) => set({ stateSchema, dirty: true }),
  setGraphConfig: (graphConfig) => set({ graphConfig, dirty: true }),
  setTemplateId: (templateId) => set({ templateId }),
  setTemplates: (templates) => set({ templates }),
  setDirty: (dirty) => set({ dirty }),
  setRunning: (running) => set({ running }),
  addExecutionEvent: (event) =>
    set((s) => ({ executionLog: [...s.executionLog, event] })),
  clearExecutionLog: () => set({ executionLog: [] }),

  reset: () => set({ ...initialState, workspaceId: get().workspaceId, templates: get().templates }),

  setWorkspaceId: (workspaceId) => set({ workspaceId }),
  setGraphId: (graphId) => set({ graphId }),

  requestLoadGraph: (wsId, graphId) => set({ _pendingLoad: { wsId, graphId } }),
  consumePendingLoad: () => {
    const pending = get()._pendingLoad
    if (pending) set({ _pendingLoad: null })
    return pending
  },

  loadWorkspaceGraphs: async (wsId) => {
    try {
      const graphs = await workspaceGraphApi.list(wsId)
      set({ workspaceGraphs: graphs })
    } catch {
      set({ workspaceGraphs: [] })
    }
  },

  loadWorkspaceGraph: async (wsId, graphId) => {
    set({ loadingGraph: true })
    try {
      const graph = graphId
        ? await workspaceGraphApi.get(wsId, graphId)
        : await workspaceGraphApi.getActive(wsId)

      if (graph) {
        set({
          workspaceId: wsId,
          graphId: graph.id,
          graphName: graph.name,
          graphDescription: graph.description,
        })
        get().loadGraphDef(graph.graphDef)
        set({ dirty: false })
      } else {
        set({ workspaceId: wsId, graphId: null })
      }
    } catch {
      set({ workspaceId: wsId, graphId: null })
    } finally {
      set({ loadingGraph: false })
    }
  },

  loadDefaultGraph: async (wsId, phaseType) => {
    set({ loadingGraph: true })
    try {
      const graphDef = await workspaceGraphApi.getDefaultGraph(phaseType)
      if (graphDef) {
        set({
          workspaceId: wsId,
          graphId: null,
          graphName: `${phaseType} (default)`,
          graphDescription: '',
        })
        get().loadGraphDef(graphDef as Record<string, unknown>)
        set({ dirty: false })
      }
    } catch {
      set({ workspaceId: wsId, graphId: null })
    } finally {
      set({ loadingGraph: false })
    }
  },

  saveToWorkspace: async (wsId) => {
    const { graphId, graphName, graphDescription, toGraphDef } = get()
    const graphDef = toGraphDef()
    const stateSchema = (graphDef as Record<string, unknown>).state_schema as Record<string, unknown>

    try {
      let savedId: string
      if (graphId) {
        const updated = await workspaceGraphApi.update(wsId, graphId, {
          name: graphName || undefined,
          description: graphDescription || undefined,
          graphDef: graphDef as Record<string, unknown>,
          stateSchema: stateSchema as Record<string, unknown>,
        })
        savedId = updated.id
        set({ graphId: savedId, dirty: false })
      } else {
        const created = await workspaceGraphApi.create(wsId, {
          name: graphName || `workflow_${Date.now()}`,
          description: graphDescription,
          graphDef: graphDef as Record<string, unknown>,
          stateSchema: stateSchema as Record<string, unknown>,
          isActive: true,
        })
        savedId = created.id
        set({ graphId: savedId, dirty: false })
      }
      get().loadWorkspaceGraphs(wsId)
    } catch (err) {
      throw err
    }
  },

  cloneTemplate: async (wsId, templateId, name) => {
    try {
      const created = await workspaceGraphApi.create(wsId, {
        name,
        sourceTemplateId: templateId,
        isActive: true,
      })
      set({ graphId: created.id, graphName: created.name })
      get().loadGraphDef(created.graphDef)
      set({ dirty: false })
      get().loadWorkspaceGraphs(wsId)
    } catch (err) {
      throw err
    }
  },

  toGraphDef: () => {
    const { nodes, edges, stateSchema, graphConfig } = get()
    return {
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.data.nodeType,
        capability_ref: n.data.capabilityRef || '',
        position: n.position,
        config: n.data.config || {},
      })),
      edges: edges.map((e) => ({
        source: e.source,
        target: e.target,
        condition: (e.data as Record<string, unknown>)?.condition || '',
      })),
      state_schema: Object.fromEntries(
        stateSchema.map((f) => [
          f.name,
          { type: f.type, reducer: f.reducer, default: f.default },
        ]),
      ),
      config: graphConfig,
    }
  },

  loadGraphDef: (def) => {
    const rawNodes = (def.nodes as Array<Record<string, unknown>>) || []
    const rawEdges = (def.edges as Array<Record<string, unknown>>) || []
    const rawState = (def.state_schema || def.stateSchema || {}) as Record<string, Record<string, unknown>>

    const nodes: Node<GraphNodeData>[] = rawNodes.map((n, i) => ({
      id: (n.id as string) || `node-${i}`,
      type: 'custom',
      position: (n.position as { x: number; y: number }) || { x: 100 + i * 200, y: 100 },
      data: {
        label: (n.id as string) || `Node ${i}`,
        nodeType: (n.type as GraphNodeData['nodeType']) || 'capability',
        capabilityRef: (n.capability_ref || n.capabilityRef || '') as string,
        config: (n.config as Record<string, unknown>) || {},
      },
    }))

    const edges: Edge[] = rawEdges
      .filter((e) => (e.source as string) !== '__start__' && (e.target as string) !== '__end__')
      .map((e, i) => ({
        id: `edge-${i}`,
        source: e.source as string,
        target: e.target as string,
        type: 'smoothstep',
        animated: true,
        data: { condition: e.condition || '' },
      }))

    const stateSchema: StateField[] = Object.entries(rawState).map(([name, spec]) => ({
      name,
      type: (spec.type as string) || 'any',
      reducer: (spec.reducer as string) || '',
      default: spec.default,
    }))

    set({ nodes, edges, stateSchema, dirty: false })
  },
}))
