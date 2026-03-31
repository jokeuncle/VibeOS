import { Save, Play, CheckCircle, LayoutGrid, FilePlus, Loader2, Upload } from 'lucide-react'
import { useGraphStore } from './useGraphStore'
import { registryApi } from '../../lib/api'
import { ExecutionSession } from '../../lib/executionSession'
import { useUIStore } from '../../stores/ui'
import { useT } from '../../i18n'

export default function GraphToolbar() {
  const t = useT()
  const addToast = useUIStore((s) => s.addToast)
  const {
    dirty, templateId, graphName, running, workspaceId,
    toGraphDef, setDirty, setTemplateId,
    setRunning, addExecutionEvent, clearExecutionLog,
    reset, nodes, saveToWorkspace,
  } = useGraphStore()

  async function handleSave() {
    if (workspaceId) {
      try {
        await saveToWorkspace(workspaceId)
        addToast({ type: 'success', message: t('controlCenter.save') + ' ✓' })
      } catch (err) {
        addToast({ type: 'error', message: String(err) })
      }
      return
    }

    const graphDef = toGraphDef()
    try {
      const result = await registryApi.createTemplate({
        intentPattern: graphName || `graph_${Date.now()}`,
        handlerType: 'graph',
        taskType: 'graph',
        graphDef: graphDef as Record<string, unknown>,
        stateSchema: (graphDef as Record<string, unknown>).state_schema as Record<string, unknown>,
      })
      setTemplateId(result.id)
      setDirty(false)
      addToast({ type: 'success', message: t('controlCenter.save') + ' ✓' })
    } catch (err) {
      addToast({ type: 'error', message: String(err) })
    }
  }

  async function handlePublishAsTemplate() {
    const graphDef = toGraphDef()
    try {
      const result = await registryApi.createTemplate({
        intentPattern: graphName || `graph_${Date.now()}`,
        handlerType: 'graph',
        taskType: 'graph',
        graphDef: graphDef as Record<string, unknown>,
        stateSchema: (graphDef as Record<string, unknown>).state_schema as Record<string, unknown>,
      })
      setTemplateId(result.id)
      addToast({ type: 'success', message: t('controlCenter.published') })
    } catch (err) {
      addToast({ type: 'error', message: String(err) })
    }
  }

  async function handleRun() {
    const graphDef = toGraphDef()
    if (nodes.length === 0) return

    setRunning(true)
    clearExecutionLog()

    const session = new ExecutionSession()
      .on('graph', (action, data) => {
        addExecutionEvent({ category: 'graph', action, data })
      })
      .on('session', (action, data) => {
        if (action === 'error') {
          addToast({ type: 'error', message: data.error || 'Graph execution error' })
        }
      })

    try {
      await session.run('/api/graph/execute', {
        template_id: templateId || '',
        graph_def: templateId ? undefined : graphDef,
        workspace_id: workspaceId || '',
      })
      addToast({ type: 'success', message: t('controlCenter.completed') })
    } catch (err) {
      addToast({ type: 'error', message: String(err) })
    } finally {
      setRunning(false)
    }
  }

  async function handleValidate() {
    const graphDef = toGraphDef()
    try {
      const result = await registryApi.validateGraph(graphDef as Record<string, unknown>)
      if (result.valid) {
        addToast({ type: 'success', message: t('controlCenter.valid') })
      } else {
        addToast({ type: 'error', message: `${t('controlCenter.invalid')}: ${result.errors.join(', ')}` })
      }
    } catch (err) {
      addToast({ type: 'error', message: String(err) })
    }
  }

  function handleAutoLayout() {
    const { nodes, setNodes } = useGraphStore.getState()
    const sorted = [...nodes]
    const positioned = sorted.map((n, i) => ({
      ...n,
      position: {
        x: 100 + (i % 3) * 250,
        y: 80 + Math.floor(i / 3) * 150,
      },
    }))
    setNodes(positioned)
  }

  function handleNew() {
    reset()
  }

  return (
    <div className="flex items-center gap-1.5">
      <ToolbarButton icon={FilePlus} label={t('controlCenter.newGraph')} onClick={handleNew} />
      <ToolbarButton icon={LayoutGrid} label={t('controlCenter.autoLayout')} onClick={handleAutoLayout} />
      <ToolbarButton icon={CheckCircle} label={t('controlCenter.validate')} onClick={handleValidate} />

      <div className="w-px h-4 bg-border-subtle mx-1" />

      <ToolbarButton
        icon={Save}
        label={t('controlCenter.save')}
        onClick={handleSave}
        accent={dirty}
      />
      {workspaceId && (
        <ToolbarButton
          icon={Upload}
          label={t('controlCenter.publishTemplate')}
          onClick={handlePublishAsTemplate}
        />
      )}
      <ToolbarButton
        icon={running ? Loader2 : Play}
        label={running ? t('controlCenter.running') : t('controlCenter.run')}
        onClick={handleRun}
        disabled={running || nodes.length === 0}
        accent
        spin={running}
      />
    </div>
  )
}

function ToolbarButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  accent,
  spin,
}: {
  icon: typeof Save
  label: string
  onClick: () => void
  disabled?: boolean
  accent?: boolean
  spin?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer
        ${accent
          ? 'bg-accent/10 text-accent hover:bg-accent/20'
          : 'text-text-secondary hover:bg-surface-3'
        }
        ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
      <Icon className={`w-3.5 h-3.5 shrink-0 ${spin ? 'animate-spin' : ''}`} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}
