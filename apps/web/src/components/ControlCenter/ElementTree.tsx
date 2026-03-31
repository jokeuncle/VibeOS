import { useEffect, useState } from 'react'
import { ChevronRight, Zap, Box, Cpu, GitFork, Plus, Copy, FileStack } from 'lucide-react'
import { registryApi } from '../../lib/api'
import type { RegistryIntent, RegistryCapability, RegistryTaskTemplate } from '../../lib/api'
import { useGraphStore } from './useGraphStore'
import { useUIStore } from '../../stores/ui'
import { useT } from '../../i18n'

interface TreeSection {
  key: string
  label: string
  icon: typeof Zap
  items: { id: string; name: string; meta: string; dragType: string }[]
}

const NODE_TYPES = [
  { id: 'condition', name: 'Condition', dragType: 'condition' },
  { id: 'human_in_loop', name: 'Human Gate', dragType: 'human_in_loop' },
  { id: 'llm_call', name: 'LLM Call', dragType: 'llm_call' },
  { id: 'subgraph', name: 'Subgraph', dragType: 'subgraph' },
]

export default function ElementTree() {
  const t = useT()
  const addToast = useUIStore((s) => s.addToast)
  const [intents, setIntents] = useState<RegistryIntent[]>([])
  const [capabilities, setCapabilities] = useState<RegistryCapability[]>([])
  const [templates, setTemplates] = useState<RegistryTaskTemplate[]>([])
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    workspaceGraphs: true,
    intents: true,
    capabilities: true,
    nodeTypes: true,
    globalTemplates: false,
  })

  const workspaceId = useGraphStore((s) => s.workspaceId)
  const workspaceGraphs = useGraphStore((s) => s.workspaceGraphs)
  const graphId = useGraphStore((s) => s.graphId)
  const loadWorkspaceGraph = useGraphStore((s) => s.loadWorkspaceGraph)
  const cloneTemplate = useGraphStore((s) => s.cloneTemplate)

  useEffect(() => {
    registryApi.listIntents(false).then(setIntents).catch(() => {})
    registryApi.listCapabilities().then(setCapabilities).catch(() => {})
    registryApi.listTemplates(false).then(setTemplates).catch(() => {})
  }, [])

  const graphTemplates = templates.filter(
    (t) => t.handlerType === 'graph' || (t.graphDef && Object.keys(t.graphDef).length > 0),
  )

  const sections: TreeSection[] = [
    {
      key: 'intents',
      label: t('registry.tab.intents'),
      icon: Zap,
      items: intents.map((i) => ({
        id: i.name,
        name: i.name,
        meta: i.labelZh || i.labelEn || '',
        dragType: 'intent',
      })),
    },
    {
      key: 'capabilities',
      label: t('registry.tab.capabilities'),
      icon: Cpu,
      items: capabilities.map((c) => ({
        id: `${c.name}::${c.provider}`,
        name: c.name,
        meta: c.provider,
        dragType: 'capability',
      })),
    },
    {
      key: 'nodeTypes',
      label: t('controlCenter.nodeType'),
      icon: GitFork,
      items: NODE_TYPES.map((n) => ({
        id: n.id,
        name: n.name,
        meta: '',
        dragType: n.dragType,
      })),
    },
  ]

  function toggle(key: string) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function onDragStart(e: React.DragEvent, item: TreeSection['items'][0]) {
    e.dataTransfer.setData('application/controlcenter', JSON.stringify({
      dragType: item.dragType,
      id: item.id,
      name: item.name,
    }))
    e.dataTransfer.effectAllowed = 'move'
  }

  async function handleCloneTemplate(tpl: RegistryTaskTemplate) {
    if (!workspaceId) return
    try {
      await cloneTemplate(workspaceId, tpl.id, tpl.intentPattern)
      addToast({ type: 'success', message: `Cloned "${tpl.intentPattern}"` })
    } catch {
      addToast({ type: 'error', message: 'Clone failed' })
    }
  }

  function handleLoadGraph(gId: string) {
    if (!workspaceId) return
    loadWorkspaceGraph(workspaceId, gId)
  }

  return (
    <div className="py-2">
      <div className="px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-text-tertiary/70">
          {t('controlCenter.elements')}
        </span>
      </div>

      {/* Workspace Graphs */}
      {workspaceId && (
        <div>
          <button
            onClick={() => toggle('workspaceGraphs')}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-medium text-text-secondary hover:bg-surface-2 transition-colors cursor-pointer"
          >
            <ChevronRight className={`w-3 h-3 transition-transform ${expanded.workspaceGraphs ? 'rotate-90' : ''}`} />
            <FileStack className="w-3.5 h-3.5 text-accent" />
            <span className="flex-1 text-left">{t('controlCenter.workspaceGraphs')}</span>
            <span className="text-[10px] text-text-tertiary tabular-nums">{workspaceGraphs.length}</span>
          </button>
          {expanded.workspaceGraphs && (
            <div className="ml-5 mr-2">
              {workspaceGraphs.length === 0 ? (
                <p className="text-[10px] text-text-tertiary px-2 py-1">{t('controlCenter.noGraphs')}</p>
              ) : (
                workspaceGraphs.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => handleLoadGraph(g.id)}
                    className={`w-full flex items-center gap-2 px-2 py-1 rounded text-[11px] text-left transition-colors cursor-pointer
                      ${g.id === graphId ? 'bg-accent/10 text-accent font-medium' : 'text-text-secondary hover:bg-surface-3'}`}
                  >
                    <span className="truncate flex-1">{g.name}</span>
                    {g.isActive && (
                      <span className="text-[9px] text-accent bg-accent/10 px-1 rounded">active</span>
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Draggable elements */}
      {sections.map((section) => (
        <div key={section.key}>
          <button
            onClick={() => toggle(section.key)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-medium text-text-secondary hover:bg-surface-2 transition-colors cursor-pointer"
          >
            <ChevronRight
              className={`w-3 h-3 transition-transform ${expanded[section.key] ? 'rotate-90' : ''}`}
            />
            <section.icon className="w-3.5 h-3.5 text-text-tertiary" />
            <span className="flex-1 text-left">{section.label}</span>
            <span className="text-[10px] text-text-tertiary tabular-nums">{section.items.length}</span>
          </button>

          {expanded[section.key] && (
            <div className="ml-5 mr-2">
              {section.items.length === 0 ? (
                <p className="text-[10px] text-text-tertiary px-2 py-1">{t('registry.empty')}</p>
              ) : (
                section.items.map((item) => (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={(e) => onDragStart(e, item)}
                    className="flex items-center gap-2 px-2 py-1 rounded text-[11px] text-text-secondary hover:bg-surface-3 cursor-grab active:cursor-grabbing transition-colors"
                  >
                    <Plus className="w-3 h-3 text-text-tertiary shrink-0" />
                    <span className="truncate flex-1">{item.name}</span>
                    {item.meta && (
                      <span className="text-[9px] text-text-tertiary truncate max-w-[60px]">{item.meta}</span>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      ))}

      {/* Global Templates (clonable) */}
      <div>
        <button
          onClick={() => toggle('globalTemplates')}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-medium text-text-secondary hover:bg-surface-2 transition-colors cursor-pointer"
        >
          <ChevronRight className={`w-3 h-3 transition-transform ${expanded.globalTemplates ? 'rotate-90' : ''}`} />
          <Box className="w-3.5 h-3.5 text-text-tertiary" />
          <span className="flex-1 text-left">{t('controlCenter.globalTemplates')}</span>
          <span className="text-[10px] text-text-tertiary tabular-nums">{graphTemplates.length}</span>
        </button>

        {expanded.globalTemplates && (
          <div className="ml-5 mr-2">
            {graphTemplates.length === 0 ? (
              <p className="text-[10px] text-text-tertiary px-2 py-1">{t('registry.empty')}</p>
            ) : (
              graphTemplates.map((tpl) => (
                <div
                  key={tpl.id}
                  className="flex items-center gap-2 px-2 py-1 rounded text-[11px] text-text-secondary hover:bg-surface-3 transition-colors"
                >
                  <span className="truncate flex-1">{tpl.intentPattern}</span>
                  {workspaceId && (
                    <button
                      onClick={() => handleCloneTemplate(tpl)}
                      className="p-0.5 rounded hover:bg-accent/10 text-text-tertiary hover:text-accent cursor-pointer"
                      title="Clone to workspace"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
