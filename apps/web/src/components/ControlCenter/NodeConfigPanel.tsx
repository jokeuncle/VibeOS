import { Plus, Trash2 } from 'lucide-react'
import { useGraphStore } from './useGraphStore'
import type { StateField } from './useGraphStore'
import { useT } from '../../i18n'

const TYPE_OPTIONS = ['string', 'int', 'float', 'bool', 'list', 'dict', 'any']
const REDUCER_OPTIONS = ['', 'append', 'replace', 'add_messages']

export default function NodeConfigPanel() {
  const t = useT()
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId)
  const selectedEdgeId = useGraphStore((s) => s.selectedEdgeId)
  const nodes = useGraphStore((s) => s.nodes)
  const edges = useGraphStore((s) => s.edges)
  const updateNodeData = useGraphStore((s) => s.updateNodeData)
  const updateEdgeData = useGraphStore((s) => s.updateEdgeData)
  const removeNode = useGraphStore((s) => s.removeNode)
  const graphName = useGraphStore((s) => s.graphName)
  const setGraphName = useGraphStore((s) => s.setGraphName)
  const stateSchema = useGraphStore((s) => s.stateSchema)
  const setStateSchema = useGraphStore((s) => s.setStateSchema)

  const selectedNode = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : null
  const selectedEdge = selectedEdgeId ? edges.find((e) => e.id === selectedEdgeId) : null

  function addStateField() {
    setStateSchema([...stateSchema, { name: '', type: 'string', reducer: '', default: '' }])
  }

  function updateStateField(idx: number, field: Partial<StateField>) {
    setStateSchema(stateSchema.map((f, i) => (i === idx ? { ...f, ...field } : f)))
  }

  function removeStateField(idx: number) {
    setStateSchema(stateSchema.filter((_, i) => i !== idx))
  }

  return (
    <div className="py-3 px-3 text-[11px]">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-text-tertiary/70">
        {t('controlCenter.config')}
      </span>

      {/* Graph name */}
      <div className="mt-3 space-y-2">
        <label className="text-text-tertiary">{t('controlCenter.graphName')}</label>
        <input
          value={graphName}
          onChange={(e) => setGraphName(e.target.value)}
          placeholder="my_workflow"
          className="w-full px-2 py-1 rounded bg-surface-2 border border-border-subtle text-text-primary text-[11px] focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      {/* Node config */}
      {selectedNode && (
        <div className="mt-4 space-y-2 border-t border-border-subtle pt-3">
          <div className="flex items-center justify-between">
            <span className="font-medium text-text-secondary">Node: {selectedNode.data.label}</span>
            <button
              onClick={() => removeNode(selectedNode.id)}
              className="p-1 rounded hover:bg-red-500/10 text-text-tertiary hover:text-red-400 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>

          <div className="space-y-1.5">
            <label className="text-text-tertiary">{t('controlCenter.nodeType')}</label>
            <select
              value={selectedNode.data.nodeType}
              onChange={(e) => updateNodeData(selectedNode.id, { nodeType: e.target.value as any })}
              className="w-full px-2 py-1 rounded bg-surface-2 border border-border-subtle text-text-primary text-[11px] focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="capability">Capability</option>
              <option value="intent">Intent</option>
              <option value="condition">Condition</option>
              <option value="human_in_loop">Human Gate</option>
              <option value="llm_call">LLM Call</option>
              <option value="subgraph">Subgraph</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-text-tertiary">Label</label>
            <input
              value={selectedNode.data.label}
              onChange={(e) => updateNodeData(selectedNode.id, { label: e.target.value })}
              className="w-full px-2 py-1 rounded bg-surface-2 border border-border-subtle text-text-primary text-[11px] focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          {selectedNode.data.nodeType === 'capability' && (
            <div className="space-y-1.5">
              <label className="text-text-tertiary">{t('controlCenter.capabilityRef')}</label>
              <input
                value={selectedNode.data.capabilityRef || ''}
                onChange={(e) => updateNodeData(selectedNode.id, { capabilityRef: e.target.value })}
                placeholder="pm.create_task"
                className="w-full px-2 py-1 rounded bg-surface-2 border border-border-subtle text-text-primary text-[11px] focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-text-tertiary">{t('controlCenter.timeout')}</label>
            <input
              type="number"
              value={(selectedNode.data.config?.timeout as number) || 30}
              onChange={(e) =>
                updateNodeData(selectedNode.id, {
                  config: { ...selectedNode.data.config, timeout: Number(e.target.value) },
                })
              }
              className="w-full px-2 py-1 rounded bg-surface-2 border border-border-subtle text-text-primary text-[11px] focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-text-tertiary">{t('controlCenter.retry')}</label>
            <input
              type="number"
              value={(selectedNode.data.config?.retry as number) || 0}
              onChange={(e) =>
                updateNodeData(selectedNode.id, {
                  config: { ...selectedNode.data.config, retry: Number(e.target.value) },
                })
              }
              className="w-full px-2 py-1 rounded bg-surface-2 border border-border-subtle text-text-primary text-[11px] focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
        </div>
      )}

      {/* Edge config */}
      {selectedEdge && (
        <div className="mt-4 space-y-2 border-t border-border-subtle pt-3">
          <span className="font-medium text-text-secondary">
            Edge: {selectedEdge.source} → {selectedEdge.target}
          </span>
          <div className="space-y-1.5">
            <label className="text-text-tertiary">{t('controlCenter.condition')}</label>
            <input
              value={((selectedEdge.data as Record<string, unknown>)?.condition as string) || ''}
              onChange={(e) => updateEdgeData(selectedEdge.id, { condition: e.target.value })}
              placeholder="state.needs_review == true"
              className="w-full px-2 py-1 rounded bg-surface-2 border border-border-subtle text-text-primary text-[11px] focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
        </div>
      )}

      {!selectedNode && !selectedEdge && (
        <p className="mt-4 text-text-tertiary text-[10px]">{t('controlCenter.noSelection')}</p>
      )}

      {/* State Schema */}
      <div className="mt-5 border-t border-border-subtle pt-3">
        <div className="flex items-center justify-between mb-2">
          <span className="font-medium text-text-secondary">{t('controlCenter.stateSchema')}</span>
          <button
            onClick={addStateField}
            className="p-0.5 rounded hover:bg-surface-3 text-text-tertiary hover:text-accent transition-colors cursor-pointer"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>

        {stateSchema.length === 0 && (
          <p className="text-[10px] text-text-tertiary">{t('controlCenter.addField')}</p>
        )}

        <div className="space-y-2">
          {stateSchema.map((field, idx) => (
            <div key={idx} className="flex items-start gap-1">
              <div className="flex-1 space-y-1">
                <input
                  value={field.name}
                  onChange={(e) => updateStateField(idx, { name: e.target.value })}
                  placeholder={t('controlCenter.fieldName')}
                  className="w-full px-1.5 py-0.5 rounded bg-surface-2 border border-border-subtle text-text-primary text-[10px] focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <div className="flex gap-1">
                  <select
                    value={field.type}
                    onChange={(e) => updateStateField(idx, { type: e.target.value })}
                    className="flex-1 px-1 py-0.5 rounded bg-surface-2 border border-border-subtle text-text-primary text-[10px] focus:outline-none"
                  >
                    {TYPE_OPTIONS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <select
                    value={field.reducer}
                    onChange={(e) => updateStateField(idx, { reducer: e.target.value })}
                    className="flex-1 px-1 py-0.5 rounded bg-surface-2 border border-border-subtle text-text-primary text-[10px] focus:outline-none"
                  >
                    {REDUCER_OPTIONS.map((r) => (
                      <option key={r} value={r}>{r || 'none'}</option>
                    ))}
                  </select>
                </div>
              </div>
              <button
                onClick={() => removeStateField(idx)}
                className="mt-0.5 p-0.5 rounded hover:bg-red-500/10 text-text-tertiary hover:text-red-400 cursor-pointer"
              >
                <Trash2 className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
