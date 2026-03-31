import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Cpu, Zap, GitFork, UserCheck, MessageSquare, Layers } from 'lucide-react'
import type { GraphNodeData } from '../useGraphStore'
import { useGraphStore } from '../useGraphStore'

const TYPE_CONFIG: Record<string, { icon: typeof Cpu; color: string; label: string }> = {
  capability: { icon: Cpu, color: 'bg-blue-500/15 border-blue-500/30 text-blue-400', label: 'Capability' },
  intent: { icon: Zap, color: 'bg-amber-500/15 border-amber-500/30 text-amber-400', label: 'Intent' },
  condition: { icon: GitFork, color: 'bg-purple-500/15 border-purple-500/30 text-purple-400', label: 'Condition' },
  human_in_loop: { icon: UserCheck, color: 'bg-green-500/15 border-green-500/30 text-green-400', label: 'Human' },
  llm_call: { icon: MessageSquare, color: 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400', label: 'LLM' },
  subgraph: { icon: Layers, color: 'bg-rose-500/15 border-rose-500/30 text-rose-400', label: 'Subgraph' },
}

interface CustomNodeProps {
  id: string
  data: GraphNodeData
  selected?: boolean
}

function CustomNodeComponent({ id, data, selected }: CustomNodeProps) {
  const selectNode = useGraphStore((s) => s.selectNode)
  const running = useGraphStore((s) => s.running)
  const executionLog = useGraphStore((s) => s.executionLog)

  const cfg = TYPE_CONFIG[data.nodeType] || TYPE_CONFIG.capability
  const Icon = cfg.icon

  const isActive = running && executionLog.some(
    (e) => e.category === 'graph' && e.action === 'node_complete' && e.data?.node === id,
  )

  return (
    <div
      onClick={() => selectNode(id)}
      className={`rounded-lg border px-3 py-2 min-w-[140px] max-w-[200px] transition-all cursor-pointer
        ${cfg.color}
        ${selected ? 'ring-2 ring-accent ring-offset-1 ring-offset-surface-0' : ''}
        ${isActive ? 'shadow-lg shadow-green-500/20' : ''}
      `}
    >
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-text-tertiary !border-surface-3" />

      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span className="text-[10px] font-medium uppercase tracking-wide opacity-70">{cfg.label}</span>
      </div>

      <div className="text-[12px] font-semibold text-text-primary truncate">{data.label}</div>

      {data.capabilityRef && (
        <div className="text-[10px] text-text-tertiary mt-0.5 truncate">{data.capabilityRef}</div>
      )}

      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-text-tertiary !border-surface-3" />
    </div>
  )
}

export default memo(CustomNodeComponent)
