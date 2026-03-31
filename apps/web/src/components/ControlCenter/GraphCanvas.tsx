import { useCallback, useMemo, DragEvent } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
} from '@xyflow/react'
import type { Node } from '@xyflow/react'
import { useGraphStore } from './useGraphStore'
import type { GraphNodeData } from './useGraphStore'
import CustomNode from './nodes/CustomNode'

let nodeIdCounter = 0

export default function GraphCanvas() {
  const {
    nodes, edges,
    onNodesChange, onEdgesChange, onConnect,
    addNode, selectNode, selectEdge,
  } = useGraphStore()

  const nodeTypes = useMemo(() => ({ custom: CustomNode }) as const, [])

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

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onNodeClick={(_, node) => selectNode(node.id)}
      onEdgeClick={(_, edge) => selectEdge(edge.id)}
      onPaneClick={() => { selectNode(null); selectEdge(null) }}
      nodeTypes={nodeTypes}
      fitView
      className="bg-surface-0"
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--color-border-subtle)" />
      <Controls
        showInteractive={false}
        className="!bg-surface-2 !border-border-default !rounded-lg !shadow-lg [&>button]:!bg-surface-2 [&>button]:!border-border-subtle [&>button]:!text-text-secondary [&>button:hover]:!bg-surface-3"
      />
      <MiniMap
        nodeColor={() => 'var(--color-accent)'}
        maskColor="rgba(0,0,0,0.6)"
        className="!bg-surface-1 !border-border-default !rounded-lg"
      />
    </ReactFlow>
  )
}
