import { Plus, Trash2 } from 'lucide-react'
import { useGraphStore } from './useGraphStore'
import type { StateField } from './useGraphStore'
import { useT } from '../../i18n'
import FormSelect from '../ui/FormSelect'
import NumberStepper from '../ui/NumberStepper'

const TYPE_OPTIONS = ['string', 'int', 'float', 'bool', 'list', 'dict', 'any']
const REDUCER_OPTIONS = ['', 'append', 'replace', 'add_messages']

// 节点类型选项
const NODE_TYPE_OPTIONS = [
  { value: 'capability', label: 'Capability' },
  { value: 'intent', label: 'Intent' },
  { value: 'condition', label: 'Condition' },
  { value: 'human_in_loop', label: 'Human Gate' },
  { value: 'llm_call', label: 'LLM Call' },
  { value: 'subgraph', label: 'Subgraph' },
  { value: 'agentic', label: 'Agentic' },
]

// Shared input class
const INPUT_CLS = 'w-full px-2.5 py-1.5 rounded-lg bg-surface-3 border border-border-subtle text-text-primary text-[11px] placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent/40 focus:border-accent/40 transition-colors'
const LABEL_CLS = 'block text-[10px] font-semibold uppercase tracking-wider text-text-tertiary mb-1'

export default function NodeConfigPanel() {
  const t = useT()
  const selectedNodeId  = useGraphStore((s) => s.selectedNodeId)
  const selectedEdgeId  = useGraphStore((s) => s.selectedEdgeId)
  const nodes           = useGraphStore((s) => s.nodes)
  const edges           = useGraphStore((s) => s.edges)
  const updateNodeData  = useGraphStore((s) => s.updateNodeData)
  const updateEdgeData  = useGraphStore((s) => s.updateEdgeData)
  const removeNode      = useGraphStore((s) => s.removeNode)
  const graphName       = useGraphStore((s) => s.graphName)
  const setGraphName    = useGraphStore((s) => s.setGraphName)
  const stateSchema     = useGraphStore((s) => s.stateSchema)
  const setStateSchema  = useGraphStore((s) => s.setStateSchema)

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
    <div className="py-3 px-3 space-y-1 text-[11px]">
      {/* ── Panel title ── */}
      <div className="pb-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-text-tertiary/70">
          {t('controlCenter.config')}
        </span>
      </div>

      {/* ── Graph Name ── */}
      <Section>
        <label className={LABEL_CLS}>{t('controlCenter.graphName')}</label>
        <input
          value={graphName}
          onChange={(e) => setGraphName(e.target.value)}
          placeholder="my_workflow"
          className={INPUT_CLS}
        />
      </Section>

      {/* ── Node config ── */}
      {selectedNode && (
        <Section>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-semibold text-text-primary truncate flex-1 mr-2">
              {selectedNode.data.label}
            </span>
            <button
              onClick={() => removeNode(selectedNode.id)}
              className="shrink-0 p-1 rounded-md hover:bg-red-500/10 text-text-tertiary hover:text-red-400 transition-colors cursor-pointer"
              title="Remove node"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className={LABEL_CLS}>{t('controlCenter.nodeType')}</label>
              <FormSelect
                size="sm"
                value={selectedNode.data.nodeType}
                options={NODE_TYPE_OPTIONS}
                onChange={(v) => updateNodeData(selectedNode.id, { nodeType: v as never })}
                fullWidth
              />
            </div>

            <div>
              <label className={LABEL_CLS}>Label</label>
              <input
                value={selectedNode.data.label}
                onChange={(e) => updateNodeData(selectedNode.id, { label: e.target.value })}
                className={INPUT_CLS}
              />
            </div>

            {selectedNode.data.nodeType === 'capability' && (
              <div>
                <label className={LABEL_CLS}>{t('controlCenter.capabilityRef')}</label>
                <input
                  value={selectedNode.data.capabilityRef || ''}
                  onChange={(e) => updateNodeData(selectedNode.id, { capabilityRef: e.target.value })}
                  placeholder="pm.create_task"
                  className={INPUT_CLS}
                />
              </div>
            )}

            {selectedNode.data.nodeType === 'agentic' && (
              <>
                <div>
                  <label className={LABEL_CLS}>{t('controlCenter.agenticSystemPrompt')}</label>
                  <textarea
                    value={(selectedNode.data.config?.system_prompt as string) || ''}
                    onChange={(e) =>
                      updateNodeData(selectedNode.id, {
                        config: { ...selectedNode.data.config, system_prompt: e.target.value },
                      })
                    }
                    placeholder="You are a helpful agent with access to tools."
                    rows={3}
                    className={INPUT_CLS + ' resize-none'}
                  />
                </div>
                <div>
                  <label className={LABEL_CLS}>{t('controlCenter.agenticMaxIter')}</label>
                  <NumberStepper
                    size="sm"
                    integer
                    min={1}
                    max={20}
                    step={1}
                    value={(selectedNode.data.config?.max_iterations as number) ?? 10}
                    onChange={(v) =>
                      updateNodeData(selectedNode.id, {
                        config: { ...selectedNode.data.config, max_iterations: v ?? 10 },
                      })
                    }
                  />
                </div>
              </>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={LABEL_CLS}>{t('controlCenter.timeout')}</label>
                <NumberStepper
                  size="sm"
                  integer
                  min={1}
                  step={1}
                  value={(selectedNode.data.config?.timeout as number) ?? 30}
                  onChange={(v) =>
                    updateNodeData(selectedNode.id, {
                      config: { ...selectedNode.data.config, timeout: v ?? 30 },
                    })
                  }
                />
              </div>
              <div>
                <label className={LABEL_CLS}>{t('controlCenter.retry')}</label>
                <NumberStepper
                  size="sm"
                  integer
                  min={0}
                  step={1}
                  value={(selectedNode.data.config?.retry as number) ?? 0}
                  onChange={(v) =>
                    updateNodeData(selectedNode.id, {
                      config: { ...selectedNode.data.config, retry: v ?? 0 },
                    })
                  }
                />
              </div>
            </div>
          </div>
        </Section>
      )}

      {/* ── Edge config ── */}
      {selectedEdge && (
        <Section>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary mb-2">Edge</p>
          <p className="text-[10px] font-mono text-text-secondary mb-3 truncate">
            {selectedEdge.source} → {selectedEdge.target}
          </p>
          <div>
            <label className={LABEL_CLS}>{t('controlCenter.condition')}</label>
            <input
              value={((selectedEdge.data as Record<string, unknown>)?.condition as string) || ''}
              onChange={(e) => updateEdgeData(selectedEdge.id, { condition: e.target.value })}
              placeholder="state.needs_review == true"
              className={INPUT_CLS}
            />
          </div>
        </Section>
      )}

      {/* empty hint */}
      {!selectedNode && !selectedEdge && (
        <p className="px-1 pt-1 text-[10px] text-text-tertiary italic leading-relaxed">
          {t('controlCenter.noSelection')}
        </p>
      )}

      {/* ── State Schema ── */}
      <Section>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
            {t('controlCenter.stateSchema')}
          </span>
          <button
            onClick={addStateField}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium text-accent bg-accent/10 hover:bg-accent/20 border border-accent/20 transition-colors cursor-pointer"
          >
            <Plus className="w-2.5 h-2.5" />
            Add
          </button>
        </div>

        {stateSchema.length === 0 && (
          <p className="text-[10px] text-text-tertiary italic">{t('controlCenter.addField')}</p>
        )}

        <div className="space-y-2">
          {stateSchema.map((field, idx) => (
            <div key={idx} className="rounded-lg bg-surface-3/60 border border-border-subtle p-2 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <input
                  value={field.name}
                  onChange={(e) => updateStateField(idx, { name: e.target.value })}
                  placeholder={t('controlCenter.fieldName')}
                  className="flex-1 px-2 py-1 rounded-md bg-surface-2 border border-border-subtle text-text-primary text-[11px] placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent/40 transition-colors"
                />
                <button
                  onClick={() => removeStateField(idx)}
                  className="shrink-0 p-1 rounded-md hover:bg-red-500/10 text-text-tertiary hover:text-red-400 cursor-pointer transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <FormSelect
                  size="sm"
                  value={field.type}
                  options={TYPE_OPTIONS.map((tp) => ({ value: tp, label: tp }))}
                  onChange={(v) => updateStateField(idx, { type: v })}
                  fullWidth
                />
                <FormSelect
                  size="sm"
                  value={field.reducer}
                  options={REDUCER_OPTIONS.map((r) => ({ value: r, label: r || 'no reducer' }))}
                  onChange={(v) => updateStateField(idx, { reducer: v })}
                  fullWidth
                />
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-1/30 p-3">
      {children}
    </div>
  )
}
