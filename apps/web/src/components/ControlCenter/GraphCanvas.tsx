import { useCallback, useMemo, DragEvent } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  type Edge,
  type DefaultEdgeOptions,
} from '@xyflow/react'
import type { Node } from '@xyflow/react'
import { GripVertical } from 'lucide-react'
import { useT } from '../../i18n'
import { useGraphStore } from './useGraphStore'
import type { GraphNodeData } from './useGraphStore'
import CustomNode from './nodes/CustomNode'

let nodeIdCounter = 0

const defaultEdgeOptions: DefaultEdgeOptions = {
  style: {
    stroke: 'var(--color-border-strong)',
    strokeWidth: 1.5,
  },
  // selected edge will be overridden per-edge via selectedEdgeId below
}

export default function GraphCanvas() {
  const t = useT()
  const {
    nodes, edges,
    onNodesChange, onEdgesChange, onConnect,
    addNode, selectNode, selectEdge, selectedEdgeId,
  } = useGraphStore()

  const nodeTypes = useMemo(() => ({ custom: CustomNode }) as const, [])

  // Apply accent color to selected edge
  const styledEdges: Edge[] = useMemo(
    () => edges.map((e) => ({
      ...e,
      style: e.id === selectedEdgeId
        ? { stroke: 'var(--color-accent)', strokeWidth: 2 }
        : { stroke: 'var(--color-border-strong)', strokeWidth: 1.5 },
      animated: e.id === selectedEdgeId,
    })),
    [edges, selectedEdgeId],
  )

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      const raw = e.dataTransfer.getData('application/controlcenter')
      if (!raw) return

      const { dragType, id, name } = JSON.parse(raw) as {
        dragType: string; id: string; name: string
      }

      const reactFlowBounds = (e.target as HTMLElement).closest('.react-flow')?.getBoundingClientRect()
      if (!reactFlowBounds) return

      const position = {
        x: e.clientX - reactFlowBounds.left,
        y: e.clientY - reactFlowBounds.top,
      }

      const nodeType = dragType === 'intent' ? 'intent'
        : dragType === 'capability' ? 'capability'
        : (dragType as GraphNodeData['nodeType'])

      const newNode: Node<GraphNodeData> = {
        id: `node-${++nodeIdCounter}-${Date.now()}`,
        type: 'custom',
        position,
        data: {
          label: name,
          nodeType,
          capabilityRef: dragType === 'capability' ? name : '',
          config: {},
        },
      }
      addNode(newNode)
    },
    [addNode],
  )

  const isEmpty = nodes.length === 0

  return (
    <div className="relative w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={styledEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onNodeClick={(_, node) => selectNode(node.id)}
        onEdgeClick={(_, edge) => selectEdge(edge.id)}
        onPaneClick={() => { selectNode(null); selectEdge(null) }}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        className="bg-surface-0"
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--color-border-subtle)" />
        <Controls
          showInteractive={false}
          className="!bg-surface-2 !border-border-default !rounded-xl !shadow-lg [&>button]:!bg-surface-2 [&>button]:!border-border-subtle [&>button]:!text-text-secondary [&>button:hover]:!bg-surface-3 [&>button]:!transition-colors"
        />
        <MiniMap
          nodeColor={() => 'var(--color-accent)'}
          maskColor="rgba(0,0,0,0.55)"
          className="!bg-surface-1 !border-border-default !rounded-xl"
        />
      </ReactFlow>

      {/* Empty state overlay */}
      {isEmpty && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-3 px-6 py-8 rounded-2xl border border-dashed border-border-default bg-surface-1/60 backdrop-blur-sm max-w-xs text-center">
            <div className="w-10 h-10 rounded-xl bg-surface-3 flex items-center justify-center">
              <GripVertical className="w-5 h-5 text-text-tertiary" />
            </div>
            <div>
              <p className="text-[12px] font-semibold text-text-secondary mb-1">
                {t('controlCenter.canvasEmpty.title')}
              </p>
              <p className="text-[11px] text-text-tertiary leading-relaxed">
                {t('controlCenter.canvasEmpty.desc')}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
