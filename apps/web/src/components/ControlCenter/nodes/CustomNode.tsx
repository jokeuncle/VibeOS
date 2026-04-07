import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Cpu, Zap, GitFork, UserCheck, MessageSquare, Layers, Bot, Workflow, AlertTriangle, Clock } from 'lucide-react'
import type { GraphNodeData } from '../useGraphStore'
import { useGraphStore } from '../useGraphStore'

interface TypeCfg {
  icon: typeof Cpu
  dot: string
  ring: string
  badge: string
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
  agentic: {
    icon: Bot,
    dot:   'bg-orange-400',
    ring:  'ring-orange-400/60',
    badge: 'bg-orange-500/10 border-orange-500/20 text-orange-400',
    label: 'Agentic',
  },
  phase: {
    icon: Workflow,
    dot:   'bg-indigo-400',
    ring:  'ring-indigo-400/60',
    badge: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400',
    label: 'Phase',
  },
}

type NodeExecStatus = 'idle' | 'running' | 'completed' | 'failed' | 'awaiting_approval'

interface CustomNodeProps {
  id: string
  data: GraphNodeData
  selected?: boolean
}

function deriveExecStatus(
  id: string,
  running: boolean,
  log: { category: string; action: string; data: Record<string, unknown> }[],
): NodeExecStatus {
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i]
    if (e.data?.node !== id) continue
    if (e.category === 'graph' && e.action === 'node_error') return 'failed'
    if (e.category === 'graph' && e.action === 'node_complete') return 'completed'
    if (e.category === 'graph' && e.action === 'node_awaiting_approval') return 'awaiting_approval'
    if (e.category === 'phase' && e.action === 'complete') return 'completed'
    if (e.category === 'phase' && e.action === 'error') return 'failed'
    if (e.category === 'phase' && e.action === 'awaiting_approval') return 'awaiting_approval'
    if (e.category === 'phase' && e.action === 'start') return 'running'
    if (e.category === 'graph' && e.action === 'node_start') return 'running'
  }
  return running ? 'idle' : 'idle'
}

const STATUS_GLOW: Record<NodeExecStatus, string> = {
  idle: '',
  running: 'shadow-[0_0_12px_2px_rgba(99,102,241,0.25)]',
  completed: '',
  failed: 'shadow-[0_0_12px_2px_rgba(239,68,68,0.25)]',
  awaiting_approval: 'shadow-[0_0_12px_2px_rgba(245,158,11,0.25)]',
}

function CustomNodeComponent({ id, data, selected }: CustomNodeProps) {
  const selectNode = useGraphStore((s) => s.selectNode)
  const running    = useGraphStore((s) => s.running)
  const executionLog = useGraphStore((s) => s.executionLog)

  const cfg = TYPE_CONFIG[data.nodeType] ?? TYPE_CONFIG.capability
  const Icon = cfg.icon
  const status = deriveExecStatus(id, running, executionLog)

  return (
    <div
      onClick={() => selectNode(id)}
      className={[
        'relative rounded-xl border bg-surface-2 transition-all cursor-pointer select-none',
        data.nodeType === 'phase' ? 'min-w-[180px] max-w-[240px]' : 'min-w-[160px] max-w-[220px]',
        selected
          ? `border-border-default ${cfg.ring} ring-2`
          : 'border-border-subtle hover:border-border-default',
        STATUS_GLOW[status],
        status === 'completed' ? 'opacity-80' : '',
      ].join(' ')}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2.5 !h-2.5 !rounded-full !border-2 !border-surface-2 !bg-border-strong hover:!bg-accent transition-colors"
        style={{ top: -5 }}
      />

      <div className="px-3 pt-2.5 pb-2.5">
        <div className="flex items-center gap-1.5 mb-2">
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[9px] font-semibold uppercase tracking-wide ${cfg.badge}`}>
            <Icon className="w-2.5 h-2.5 shrink-0" />
            {cfg.label}
          </span>
          <StatusIndicator status={status} dotClass={cfg.dot} />
        </div>

        <div className="text-[12px] font-semibold text-text-primary leading-snug truncate">
          {data.label}
        </div>

        {data.capabilityRef && (
          <div className="mt-0.5 text-[10px] text-text-tertiary truncate font-mono">
            {data.capabilityRef}
          </div>
        )}

        {data.nodeType === 'phase' && data.config?.quality_gate && (
          <div className="mt-1 text-[9px] text-text-tertiary flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
            Gate: {String(data.config.quality_gate)}
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2.5 !h-2.5 !rounded-full !border-2 !border-surface-2 !bg-border-strong hover:!bg-accent transition-colors"
        style={{ bottom: -5 }}
      />
    </div>
  )
}

function StatusIndicator({ status, dotClass }: { status: NodeExecStatus; dotClass: string }) {
  if (status === 'running') {
    return (
      <span className="ml-auto flex h-2 w-2 shrink-0">
        <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-accent opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
      </span>
    )
  }
  if (status === 'completed') {
    return <span className={`ml-auto w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
  }
  if (status === 'failed') {
    return <AlertTriangle className="ml-auto w-3 h-3 shrink-0 text-red-400" />
  }
  if (status === 'awaiting_approval') {
    return <Clock className="ml-auto w-3 h-3 shrink-0 text-amber-400 animate-pulse" />
  }
  return null
}

export default memo(CustomNodeComponent)
