import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { useT } from '../i18n'
import { useWorkspaceStore, type AgentStatusEvent } from '../stores/workspace'
import type { Agent, AgentType } from '../types'
import type { TranslationKey } from '../i18n/en'

interface Edge {
  from: AgentType
  to: AgentType
  label?: string
}

const PIPELINE_EDGES: Edge[] = [
  { from: 'pm', to: 'requirement' },
  { from: 'requirement', to: 'design' },
  { from: 'design', to: 'architecture' },
  { from: 'architecture', to: 'development' },
  { from: 'development', to: 'testing' },
  { from: 'testing', to: 'cicd' },
  { from: 'cicd', to: 'monitoring' },
  { from: 'pm', to: 'design' },
  { from: 'pm', to: 'development' },
  { from: 'monitoring', to: 'pm' },
]

const STATUS_COLOR: Record<string, string> = {
  idle: '#64748b',
  running: '#6366f1',
  waiting: '#f59e0b',
  error: '#ef4444',
}

const ALL_AGENTS: AgentType[] = ['pm', 'requirement', 'design', 'architecture', 'development', 'testing', 'cicd', 'monitoring']

function getNodePositions(cx: number, cy: number, radius: number): Record<AgentType, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {}
  const outer = ALL_AGENTS.filter((a) => a !== 'pm')

  positions.pm = { x: cx, y: cy }

  outer.forEach((agent, i) => {
    const angle = (i / outer.length) * Math.PI * 2 - Math.PI / 2
    positions[agent] = {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    }
  })

  return positions as Record<AgentType, { x: number; y: number }>
}

function detectActiveEdges(agents: Agent[], history: AgentStatusEvent[]): Set<string> {
  const active = new Set<string>()
  const runningAgents = agents.filter((a) => a.status === 'running').map((a) => a.type)

  if (runningAgents.length === 0) return active

  for (const agent of runningAgents) {
    for (const edge of PIPELINE_EDGES) {
      if (edge.from === agent || edge.to === agent) {
        const other = edge.from === agent ? edge.to : edge.from
        const otherAgent = agents.find((a) => a.type === other)
        if (otherAgent && (otherAgent.status === 'running' || otherAgent.status === 'waiting')) {
          active.add(`${edge.from}-${edge.to}`)
        }
      }
    }
  }

  return active
}

export default function AgentTopology({ agents }: { agents: Agent[] }) {
  const t = useT()
  const [hoveredAgent, setHoveredAgent] = useState<AgentType | null>(null)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const agentStatusHistory = useWorkspaceStore((s) => s.agentStatusHistory)

  const history = activeWorkspaceId ? agentStatusHistory[activeWorkspaceId] || [] : []

  const activeEdges = useMemo(() => detectActiveEdges(agents, history), [agents, history])

  const W = 560
  const H = 420
  const CX = W / 2
  const CY = H / 2
  const R = 150

  const positions = getNodePositions(CX, CY, R)

  const agentMap = new Map(agents.map((a) => [a.type, a]))

  function getStatus(type: AgentType) {
    return agentMap.get(type)?.status || 'idle'
  }

  const isHighlighted = (type: AgentType) =>
    !hoveredAgent || hoveredAgent === type ||
    PIPELINE_EDGES.some((e) =>
      (e.from === hoveredAgent && e.to === type) || (e.to === hoveredAgent && e.from === type))

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-1/30 overflow-hidden">
      <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
        <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
          {t('agent.topology')}
        </span>
        <div className="flex items-center gap-3">
          {Object.entries(STATUS_COLOR).map(([status, color]) => (
            <div key={status} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-[10px] text-text-tertiary capitalize">{status}</span>
            </div>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 420 }}>
        <defs>
          <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto" fill="var(--color-text-tertiary)">
            <polygon points="0 0, 8 3, 0 6" opacity="0.4" />
          </marker>
          <marker id="arrowhead-active" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto" fill="#6366f1">
            <polygon points="0 0, 8 3, 0 6" opacity="0.8" />
          </marker>
          <filter id="glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="edge-glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Edges */}
        {PIPELINE_EDGES.map((edge, i) => {
          const from = positions[edge.from]
          const to = positions[edge.to]
          if (!from || !to) return null
          const dx = to.x - from.x
          const dy = to.y - from.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          const nodeR = 28
          const sx = from.x + (dx / dist) * nodeR
          const sy = from.y + (dy / dist) * nodeR
          const ex = to.x - (dx / dist) * (nodeR + 8)
          const ey = to.y - (dy / dist) * (nodeR + 8)
          const highlighted = isHighlighted(edge.from) && isHighlighted(edge.to)
          const isActive = activeEdges.has(`${edge.from}-${edge.to}`)

          return (
            <g key={i}>
              <motion.line
                x1={sx} y1={sy} x2={ex} y2={ey}
                stroke={isActive ? '#6366f1' : 'var(--color-text-tertiary)'}
                strokeWidth={isActive ? 2.5 : highlighted ? 1.5 : 0.5}
                strokeDasharray={edge.from === 'monitoring' ? '4 4' : undefined}
                markerEnd={isActive ? 'url(#arrowhead-active)' : 'url(#arrowhead)'}
                initial={{ opacity: 0 }}
                animate={{ opacity: isActive ? 0.8 : highlighted ? 0.5 : 0.12 }}
                transition={{ duration: 0.3 }}
                filter={isActive ? 'url(#edge-glow)' : undefined}
              />
              {isActive && (
                <motion.circle
                  r={3}
                  fill="#6366f1"
                  initial={{ opacity: 0 }}
                  animate={{
                    opacity: [0, 1, 0],
                    cx: [sx, ex],
                    cy: [sy, ey],
                  }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                />
              )}
            </g>
          )
        })}

        {/* Agent nodes */}
        {ALL_AGENTS.map((type) => {
          const pos = positions[type]
          const status = getStatus(type)
          const color = STATUS_COLOR[status]
          const highlighted = isHighlighted(type)
          const isPM = type === 'pm'
          const nodeR = isPM ? 32 : 26
          const currentTask = agentMap.get(type)?.currentTask

          return (
            <g
              key={type}
              onMouseEnter={() => setHoveredAgent(type)}
              onMouseLeave={() => setHoveredAgent(null)}
              className="cursor-pointer"
            >
              {/* Glow ring for running */}
              {status === 'running' && (
                <motion.circle
                  cx={pos.x} cy={pos.y} r={nodeR + 6}
                  fill="none" stroke={color}
                  strokeWidth={2}
                  initial={{ opacity: 0.4, r: nodeR + 4 }}
                  animate={{ opacity: [0.4, 0.1, 0.4], r: [nodeR + 4, nodeR + 10, nodeR + 4] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              )}

              {/* Background circle */}
              <motion.circle
                cx={pos.x} cy={pos.y} r={nodeR}
                fill="var(--color-surface-2)"
                stroke={color}
                strokeWidth={highlighted ? 2 : 1}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: highlighted ? 1 : 0.4, scale: 1 }}
                transition={{ duration: 0.4, delay: 0.05 * ALL_AGENTS.indexOf(type) }}
                filter={status === 'running' ? 'url(#glow)' : undefined}
              />

              {/* Status dot */}
              <circle cx={pos.x + nodeR - 4} cy={pos.y - nodeR + 4} r={4} fill={color} stroke="var(--color-surface-2)" strokeWidth={2} />

              {/* Agent icon (text abbreviation) */}
              <text
                x={pos.x} y={pos.y - 2}
                textAnchor="middle" dominantBaseline="middle"
                fill={highlighted ? color : 'var(--color-text-tertiary)'}
                fontSize={isPM ? 13 : 11}
                fontWeight="600"
                fontFamily="var(--font-mono)"
              >
                {type === 'pm' ? 'PM' : type === 'cicd' ? 'CI' : type.slice(0, 3).toUpperCase()}
              </text>

              {/* Label */}
              <text
                x={pos.x} y={pos.y + (isPM ? 14 : 12)}
                textAnchor="middle" dominantBaseline="middle"
                fill="var(--color-text-tertiary)"
                fontSize={8}
                opacity={highlighted ? 0.8 : 0.3}
              >
                {t(`agent.name.${type}` as TranslationKey)}
              </text>

              {/* Current task tooltip on hover */}
              {hoveredAgent === type && currentTask && (
                <foreignObject
                  x={pos.x - 60}
                  y={pos.y + nodeR + 8}
                  width={120}
                  height={32}
                >
                  <div className="px-2 py-1 rounded bg-surface-3 border border-border-subtle text-center">
                    <span className="text-[8px] text-text-tertiary line-clamp-2">{currentTask}</span>
                  </div>
                </foreignObject>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
