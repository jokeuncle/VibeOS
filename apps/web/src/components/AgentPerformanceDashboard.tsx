import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Activity, Clock, Wrench, Zap, AlertCircle, RefreshCw, BarChart3 } from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspace'

interface AgentMetric {
  agent: string
  totalInvocations: number
  avgLatencyMs: number
  errorRate: number
  toolCalls: number
  lastActive: string
}

interface ToolMetric {
  name: string
  calls: number
  avgMs: number
  successRate: number
}

const AGENTS = [
  'requirement', 'architecture', 'design', 'development', 'testing', 'cicd', 'monitoring', 'coding',
]

function mockMetrics(): { agents: AgentMetric[]; tools: ToolMetric[] } {
  return {
    agents: AGENTS.map(a => ({
      agent: a,
      totalInvocations: Math.floor(Math.random() * 100),
      avgLatencyMs: Math.floor(Math.random() * 5000) + 500,
      errorRate: Math.random() * 0.1,
      toolCalls: Math.floor(Math.random() * 50),
      lastActive: new Date(Date.now() - Math.random() * 86400000).toISOString(),
    })),
    tools: [
      { name: 'gitlab_push_file', calls: 42, avgMs: 1200, successRate: 0.95 },
      { name: 'create_workspace_task', calls: 38, avgMs: 340, successRate: 0.98 },
      { name: 'delegate_to_agent', calls: 22, avgMs: 8500, successRate: 0.91 },
      { name: 'rag_search', calls: 65, avgMs: 450, successRate: 0.99 },
      { name: 'memory_query', calls: 55, avgMs: 220, successRate: 1.0 },
    ],
  }
}

export default function AgentPerformanceDashboard() {
  const [data, setData] = useState<ReturnType<typeof mockMetrics> | null>(null)

  const load = useCallback(() => {
    setData(mockMetrics())
  }, [])

  useEffect(() => { load() }, [load])

  if (!data) return null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-text-secondary" />
          <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
            Agent Performance
          </h3>
        </div>
        <button
          onClick={load}
          className="rounded-md border border-border-subtle bg-surface-2/40 px-2.5 py-1.5 text-[11px] font-medium text-text-secondary hover:bg-surface-2/60 transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>

      {/* Agent metrics grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {data.agents.filter(a => a.totalInvocations > 0).map(agent => (
          <motion.div
            key={agent.agent}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-border-subtle bg-surface-1/30 p-3"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-lg bg-accent/10 flex items-center justify-center">
                <Activity className="w-3 h-3 text-accent" />
              </div>
              <span className="text-[11px] font-semibold text-text-secondary capitalize">{agent.agent}</span>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-[10px]">
                <span className="text-text-tertiary">Invocations</span>
                <span className="text-text-primary font-mono">{agent.totalInvocations}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-text-tertiary flex items-center gap-1"><Clock className="w-2.5 h-2.5" /> Avg</span>
                <span className="text-text-primary font-mono">{(agent.avgLatencyMs / 1000).toFixed(1)}s</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-text-tertiary flex items-center gap-1"><Wrench className="w-2.5 h-2.5" /> Tools</span>
                <span className="text-text-primary font-mono">{agent.toolCalls}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-text-tertiary flex items-center gap-1"><AlertCircle className="w-2.5 h-2.5" /> Errors</span>
                <span className={`font-mono ${agent.errorRate > 0.05 ? 'text-red-400' : 'text-green-400'}`}>
                  {(agent.errorRate * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Tool performance table */}
      <div className="rounded-xl border border-border-subtle bg-surface-1/30 overflow-hidden">
        <div className="px-4 py-3 border-b border-border-subtle flex items-center gap-2">
          <Wrench className="w-3.5 h-3.5 text-text-secondary" />
          <span className="text-[11px] font-semibold text-text-secondary">Tool Performance</span>
        </div>
        <div className="divide-y divide-border-subtle">
          {data.tools.map(tool => (
            <div key={tool.name} className="px-4 py-2.5 flex items-center gap-4 hover:bg-surface-2/35 transition-colors">
              <div className="flex-1 min-w-0">
                <span className="text-[11px] font-medium text-text-primary font-mono">{tool.name}</span>
              </div>
              <div className="text-[10px] text-text-tertiary w-16 text-right">
                {tool.calls} calls
              </div>
              <div className="text-[10px] text-text-tertiary w-16 text-right font-mono">
                {tool.avgMs}ms
              </div>
              <div className={`text-[10px] w-12 text-right font-mono ${tool.successRate >= 0.95 ? 'text-green-400' : 'text-yellow-400'}`}>
                {(tool.successRate * 100).toFixed(0)}%
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
