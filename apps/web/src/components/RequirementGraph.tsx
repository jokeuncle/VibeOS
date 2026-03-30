import { useMemo, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { GitBranch } from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspace'
import { useUIStore } from '../stores/ui'
import { useT } from '../i18n'
import type { Requirement, RequirementRelation, RequirementStatus, RelationType } from '../types'

const STATUS_ORDER: RequirementStatus[] = ['draft', 'designing', 'ready', 'in_progress', 'completed']
const STATUS_FILL: Record<RequirementStatus, string> = {
  draft: 'var(--color-surface-4)',
  designing: 'var(--color-accent)',
  ready: 'var(--color-success)',
  in_progress: 'var(--color-accent)',
  completed: 'var(--color-success)',
}

const EDGE_COLORS: Record<RelationType, string> = {
  depends_on: 'var(--color-accent)',
  parent_of: 'var(--color-success)',
  related_to: 'var(--color-text-tertiary)',
  evolves_from: 'var(--color-warning)',
  conflicts_with: 'var(--color-danger)',
}

const EDGE_LABELS: Record<RelationType, string> = {
  depends_on: 'depends',
  parent_of: 'parent',
  related_to: 'related',
  evolves_from: 'evolves',
  conflicts_with: 'conflicts',
}

interface NodePos {
  id: string
  x: number
  y: number
  req: Requirement
}

const NODE_W = 180
const NODE_H = 64
const CARD_RX = 12

export default function RequirementGraph() {
  const t = useT()
  const { workspaces, activeWorkspaceId, setActiveRequirement } = useWorkspaceStore()
  const { setViewMode } = useUIStore()
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)

  const workspace = workspaces.find(w => w.id === activeWorkspaceId)
  const requirements = workspace?.requirements || []

  const { nodes, width, height, edges } = useMemo(() => {
    if (requirements.length === 0) return { nodes: [], width: 600, height: 300, edges: [] as RequirementRelation[] }

    const COL_GAP = 80
    const ROW_GAP = 24
    const PAD = 40

    const columns: Record<RequirementStatus, Requirement[]> = {
      draft: [], designing: [], ready: [], in_progress: [], completed: [],
    }
    requirements.forEach(r => columns[r.status].push(r))

    const maxRows = Math.max(1, ...Object.values(columns).map(c => c.length))
    const numCols = STATUS_ORDER.length
    const totalWidth = numCols * NODE_W + (numCols - 1) * COL_GAP + 2 * PAD
    const totalHeight = maxRows * NODE_H + (maxRows - 1) * ROW_GAP + 2 * PAD

    const positions: NodePos[] = []
    STATUS_ORDER.forEach((status, colIdx) => {
      const col = columns[status]
      const colX = PAD + colIdx * (NODE_W + COL_GAP)
      col.forEach((req, rowIdx) => {
        positions.push({
          id: req.id,
          x: colX,
          y: PAD + rowIdx * (NODE_H + ROW_GAP),
          req,
        })
      })
    })

    const edgesMap = new Map<string, RequirementRelation>()
    for (const p of positions) {
      for (const rel of p.req.relations ?? []) {
        if (!edgesMap.has(rel.id)) edgesMap.set(rel.id, rel)
      }
    }

    return { nodes: positions, width: totalWidth, height: totalHeight, edges: [...edgesMap.values()] }
  }, [requirements])

  const handleClick = useCallback((id: string) => {
    setActiveRequirement(id)
    setViewMode('requirements')
  }, [setActiveRequirement, setViewMode])

  if (requirements.length === 0) {
    return (
      <div className="text-center py-14 px-4">
        <div className="w-12 h-12 rounded-2xl bg-surface-2/80 border border-border-subtle flex items-center justify-center mx-auto mb-4">
          <GitBranch className="w-5 h-5 text-text-tertiary opacity-60" />
        </div>
        <p className="text-sm text-text-tertiary">{t('requirement.empty' as any)}</p>
      </div>
    )
  }

  return (
    <div>
      <div className="overflow-auto rounded-lg bg-surface-2/15">
        {/* Legend */}
        <div className="flex items-center gap-4 px-4 py-2.5 border-b border-border-subtle">
          <span className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">
            {t('requirement.relations' as any)}
          </span>
          <div className="flex-1" />
          {Object.entries(EDGE_LABELS).map(([type, label]) => (
            <div key={type} className="flex items-center gap-1.5">
              <div className="w-4 h-0.5 rounded" style={{ backgroundColor: EDGE_COLORS[type as RelationType] }} />
              <span className="text-[9px] text-text-tertiary">{t(`requirement.relation.${type}` as any)}</span>
            </div>
          ))}
        </div>

        <svg
          width={width}
          height={height}
          className="w-full"
          style={{ minHeight: height, maxHeight: 500 }}
          viewBox={`0 0 ${width} ${height}`}
        >
          {/* Relation edges — source → target (deduped); list API attaches rels to both endpoints */}
          {edges.map((rel) => {
            const from = nodes.find(n => n.id === rel.sourceId)
            const to = nodes.find(n => n.id === rel.targetId)
            if (!from || !to) return null
            const x1 = from.x + NODE_W
            const y1 = from.y + NODE_H / 2
            const x2 = to.x
            const y2 = to.y + NODE_H / 2
            const mx = (x1 + x2) / 2
            const color = EDGE_COLORS[rel.relationType] ?? 'var(--color-text-tertiary)'
            return (
              <g key={rel.id}>
                <path
                  d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke={color}
                  strokeWidth={1.5}
                  strokeOpacity={0.55}
                  markerEnd={`url(#arrow-${rel.relationType})`}
                />
              </g>
            )
          })}

          {/* Arrow markers */}
          <defs>
            {Object.entries(EDGE_COLORS).map(([type, color]) => (
              <marker
                key={type}
                id={`arrow-${type}`}
                markerWidth="6"
                markerHeight="6"
                refX="5"
                refY="3"
                orient="auto"
              >
                <path d="M0,0 L0,6 L6,3 z" fill={color} fillOpacity={0.6} />
              </marker>
            ))}
          </defs>

          {/* Column headers */}
          {STATUS_ORDER.map((status, i) => (
            <text
              key={status}
              x={40 + i * 260 + 90}
              y={20}
              textAnchor="middle"
              fill="var(--color-text-tertiary)"
              fontSize="10"
              fontWeight="600"
              fontFamily="var(--font-sans)"
            >
              {t(`requirement.status.${status}` as any)}
            </text>
          ))}

          {/* Nodes */}
          {nodes.map((node, i) => {
            const isHovered = hoveredNode === node.id
            const progress = node.req.taskCount > 0
              ? (node.req.doneCount / node.req.taskCount) * 168
              : 0

            return (
              <motion.g
                key={node.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={() => handleClick(node.id)}
                style={{ cursor: 'pointer' }}
              >
                <rect
                  x={node.x}
                  y={node.y}
                  width={NODE_W}
                  height={NODE_H}
                  rx={CARD_RX}
                  ry={CARD_RX}
                  fill={isHovered ? 'var(--color-surface-3)' : 'var(--color-surface-2)'}
                  stroke={isHovered ? 'var(--color-accent)' : 'var(--color-border-subtle)'}
                  strokeWidth={isHovered ? 1.5 : 1}
                />
                {/* Title */}
                <text
                  x={node.x + 12}
                  y={node.y + 22}
                  fill="var(--color-text-primary)"
                  fontSize="11"
                  fontWeight="500"
                  fontFamily="var(--font-sans)"
                >
                  {node.req.title.length > 20 ? node.req.title.slice(0, 20) + '…' : node.req.title}
                </text>
                {/* Phase + count */}
                <text
                  x={node.x + 12}
                  y={node.y + 38}
                  fill="var(--color-text-tertiary)"
                  fontSize="9"
                  fontFamily="var(--font-mono)"
                >
                  {node.req.currentPhase} · {node.req.doneCount}/{node.req.taskCount}
                </text>
                {/* Progress bar background */}
                <rect x={node.x + 6} y={node.y + 50} width={168} height={3} rx={1.5} fill="var(--color-surface-4)" />
                {/* Progress bar fill */}
                <rect x={node.x + 6} y={node.y + 50} width={progress} height={3} rx={1.5} fill={STATUS_FILL[node.req.status]} opacity={0.7} />
              </motion.g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}
