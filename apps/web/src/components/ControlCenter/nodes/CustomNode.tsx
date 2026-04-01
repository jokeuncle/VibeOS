import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Cpu, Zap, GitFork, UserCheck, MessageSquare, Layers } from 'lucide-react'
import type { GraphNodeData } from '../useGraphStore'
import { useGraphStore } from '../useGraphStore'

interface TypeCfg {
  icon: typeof Cpu
  dot: string          // dot color
  ring: string         // selected ring color
  badge: string        // badge pill
  label: string
}

const TYPE_CONFIG: Record<string, TypeCfg> = {
  capability: {
    icon: Cpu,
    dot:   'bg-blue-400',
    ring:  'ring-blue-400/60',
    badge: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
    label: 'Capability',
  },
  intent: {
    icon: Zap,
    dot:   'bg-amber-400',
    ring:  'ring-amber-400/60',
    badge: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
    label: 'Intent',
  },
  condition: {
    icon: GitFork,
    dot:   'bg-purple-400',
    ring:  'ring-purple-400/60',
    badge: 'bg-purple-500/10 border-purple-500/20 text-purple-400',
    label: 'Condition',
  },
  human_in_loop: {
    icon: UserCheck,
    dot:   'bg-emerald-400',
    ring:  'ring-emerald-400/60',
    badge: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
    label: 'Human',
  },
  llm_call: {
    icon: MessageSquare,
    dot:   'bg-cyan-400',
    ring:  'ring-cyan-400/60',
    badge: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400',
    label: 'LLM',
  },
  subgraph: {
    icon: Layers,
    dot:   'bg-rose-400',
    ring:  'ring-rose-400/60',
    badge: 'bg-rose-500/10 border-rose-500/20 text-rose-400',
    label: 'Subgraph',
  },
}

interface CustomNodeProps {
  id: string
  data: GraphNodeData
  selected?: boolean
}

function CustomNodeComponent({ id, data, selected }: CustomNodeProps) {
  const selectNode = useGraphStore((s) => s.selectNode)
  const running    = useGraphStore((s) => s.running)
  const executionLog = useGraphStore((s) => s.executionLog)

  const cfg = TYPE_CONFIG[data.nodeType] ?? TYPE_CONFIG.capability
  const Icon = cfg.icon

  const isDone = executionLog.some(
    (e) => e.category === 'graph' && e.action === 'node_complete' && e.data?.node === id,
  )
  const isRunning = running && !isDone

  return (
    <div
      onClick={() => selectNode(id)}
      className={[
        'relative rounded-xl border bg-surface-2 transition-all cursor-pointer select-none',
        'min-w-[160px] max-w-[220px]',
        // border: muted by default, accent when selected
        selected
          ? `border-border-default ${cfg.ring} ring-2`
          : 'border-border-subtle hover:border-border-default',
        // running pulse glow
        isRunning ? 'shadow-[0_0_12px_2px_rgba(99,102,241,0.25)]' : '',
        isDone    ? 'opacity-80' : '',
      ].join(' ')}
    >
      {/* top handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2.5 !h-2.5 !rounded-full !border-2 !border-surface-2 !bg-border-strong hover:!bg-accent transition-colors"
        style={{ top: -5 }}
      />

      {/* node body */}
      <div className="px-3 pt-2.5 pb-2.5">
        {/* type badge row */}
        <div className="flex items-center gap-1.5 mb-2">
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[9px] font-semibold uppercase tracking-wide ${cfg.badge}`}>
            <Icon className="w-2.5 h-2.5 shrink-0" />
            {cfg.label}
          </span>
          {/* running pulse dot */}
          {isRunning && (
            <span className="ml-auto flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-accent opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
          )}
          {isDone && (
            <span className={`ml-auto w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
          )}
        </div>

        {/* label */}
        <div className="text-[12px] font-semibold text-text-primary leading-snug truncate">
          {data.label}
        </div>

        {/* capability ref */}
        {data.capabilityRef && (
          <div className="mt-0.5 text-[10px] text-text-tertiary truncate font-mono">
            {data.capabilityRef}
          </div>
        )}
      </div>

      {/* bottom handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2.5 !h-2.5 !rounded-full !border-2 !border-surface-2 !bg-border-strong hover:!bg-accent transition-colors"
        style={{ bottom: -5 }}
      />
    </div>
  )
}

export default memo(CustomNodeComponent)
