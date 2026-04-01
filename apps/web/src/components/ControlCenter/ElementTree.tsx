import { useEffect, useState } from 'react'
import { ChevronRight, Zap, Box, Cpu, GitFork, Copy, FileStack, GripVertical, UserCheck, MessageSquare, Layers } from 'lucide-react'
import { registryApi } from '../../lib/api'
import type { RegistryIntent, RegistryCapability, RegistryTaskTemplate } from '../../lib/api'
import { useGraphStore } from './useGraphStore'
import { useUIStore } from '../../stores/ui'
import { useT } from '../../i18n'

interface DragItem {
  id: string
  name: string
  meta: string
  dragType: string
}

interface TreeSection {
  key: string
  label: string
  icon: typeof Zap
  iconColor: string
  items: DragItem[]
}

// type badge config shared with CustomNode colours
const DRAG_TYPE_CFG: Record<string, { icon: typeof Zap; dot: string }> = {
  intent:       { icon: Zap,          dot: 'bg-amber-400'  },
  capability:   { icon: Cpu,          dot: 'bg-blue-400'   },
  condition:    { icon: GitFork,      dot: 'bg-purple-400' },
  human_in_loop:{ icon: UserCheck,    dot: 'bg-emerald-400'},
  llm_call:     { icon: MessageSquare,dot: 'bg-cyan-400'   },
  subgraph:     { icon: Layers,       dot: 'bg-rose-400'   },
}

const NODE_TYPES: DragItem[] = [
  { id: 'condition',     name: 'Condition',  meta: '', dragType: 'condition'     },
  { id: 'human_in_loop', name: 'Human Gate', meta: '', dragType: 'human_in_loop' },
  { id: 'llm_call',      name: 'LLM Call',   meta: '', dragType: 'llm_call'      },
  { id: 'subgraph',      name: 'Subgraph',   meta: '', dragType: 'subgraph'      },
]

export default function ElementTree() {
  const t = useT()
  const addToast = useUIStore((s) => s.addToast)
  const [intents,      setIntents]      = useState<RegistryIntent[]>([])
  const [capabilities, setCapabilities] = useState<RegistryCapability[]>([])
  const [templates,    setTemplates]    = useState<RegistryTaskTemplate[]>([])
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    workspaceGraphs: true,
    intents:         true,
    capabilities:    true,
    nodeTypes:       true,
    globalTemplates: true,
  })

  const workspaceId     = useGraphStore((s) => s.workspaceId)
  const workspaceGraphs = useGraphStore((s) => s.workspaceGraphs)
  const graphId         = useGraphStore((s) => s.graphId)
  const loadWorkspaceGraph = useGraphStore((s) => s.loadWorkspaceGraph)
  const cloneTemplate      = useGraphStore((s) => s.cloneTemplate)

  useEffect(() => {
    registryApi.listIntents(false).then(setIntents).catch(() => {})
    registryApi.listCapabilities().then(setCapabilities).catch(() => {})
    registryApi.listTemplates(false).then(setTemplates).catch(() => {})
  }, [])

  const graphTemplates = templates.filter(
    (tpl) => tpl.handlerType === 'graph' || (tpl.graphDef && Object.keys(tpl.graphDef).length > 0),
  )

  // Helper to get capability display name with i18n
  const getCapabilityName = (capability: RegistryCapability): string => {
    const key = `capability.${capability.name}`
    const translated = t(key as never)
    // If translation returns the key itself, fallback to the raw name
    if (translated === key) {
      return capability.name
    }
    return translated
  }

  const sections: TreeSection[] = [
    {
      key: 'intents',
      label: t('registry.tab.intents'),
      icon: Zap,
      iconColor: 'text-amber-400',
      items: intents.map((i) => ({ id: i.name, name: i.labelZh || i.labelEn || i.name, meta: i.name, dragType: 'intent' })),
    },
    {
      key: 'capabilities',
      label: t('registry.tab.capabilities'),
      icon: Cpu,
      iconColor: 'text-blue-400',
      items: capabilities.map((c) => ({ id: `${c.name}::${c.provider}`, name: getCapabilityName(c), meta: c.provider, dragType: 'capability' })),
    },
    {
      key: 'nodeTypes',
      label: t('controlCenter.nodeType'),
      icon: GitFork,
      iconColor: 'text-purple-400',
      items: NODE_TYPES,
    },
  ]

  function toggle(key: string) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function onDragStart(e: React.DragEvent, item: DragItem) {
    e.dataTransfer.setData('application/controlcenter', JSON.stringify({ dragType: item.dragType, id: item.id, name: item.name }))
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
    <div className="py-2 select-none">
      {/* header label */}
      <div className="px-3 pb-1.5 pt-1">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-text-tertiary/70">
          {t('controlCenter.elements')}
        </span>
      </div>

      {/* ── Workspace Graphs ── */}
      {workspaceId && (
        <SectionHeader
          label={t('controlCenter.workspaceGraphs')}
          icon={FileStack}
          iconColor="text-accent"
          count={workspaceGraphs.length}
          open={expanded.workspaceGraphs}
          onToggle={() => toggle('workspaceGraphs')}
        />
      )}
      {workspaceId && expanded.workspaceGraphs && (
        <div className="ml-7 mr-2 mb-1">
          {workspaceGraphs.length === 0 ? (
            <p className="text-[10px] text-text-tertiary px-2 py-1 italic">{t('controlCenter.noGraphs')}</p>
          ) : (
            workspaceGraphs.map((g) => (
              <button
                key={g.id}
                onClick={() => handleLoadGraph(g.id)}
                className={`w-full flex items-center gap-2 px-2 py-1 rounded-md text-[11px] text-left transition-colors cursor-pointer
                  ${g.id === graphId
                    ? 'bg-accent/10 text-accent font-medium'
                    : 'text-text-secondary hover:bg-surface-3'
                  }`}
              >
                <span className="truncate flex-1">{g.name}</span>
                {g.isActive && (
                  <span className="text-[9px] font-semibold text-accent bg-accent/10 border border-accent/20 px-1 py-0.5 rounded">active</span>
                )}
              </button>
            ))
          )}
        </div>
      )}

      {/* ── Draggable sections ── */}
      {sections.map((section) => (
        <div key={section.key}>
          <SectionHeader
            label={section.label}
            icon={section.icon}
            iconColor={section.iconColor}
            count={section.items.length}
            open={expanded[section.key]}
            onToggle={() => toggle(section.key)}
          />
          {expanded[section.key] && (
            <div className="ml-7 mr-2 mb-1">
              {section.items.length === 0 ? (
                <p className="text-[10px] text-text-tertiary px-2 py-1 italic">{t('registry.empty')}</p>
              ) : (
                section.items.map((item) => {
                  const typeCfg = DRAG_TYPE_CFG[item.dragType]
                  return (
                    <div
                      key={item.id}
                      draggable
                      onDragStart={(e) => onDragStart(e, item)}
                      className="group flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] text-text-secondary hover:bg-surface-3 cursor-grab active:cursor-grabbing transition-colors"
                    >
                      {/* type dot */}
                      {typeCfg && (
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${typeCfg.dot}`} />
                      )}
                      <span className="truncate flex-1">{item.name}</span>
                      {item.meta && (
                        <span className="text-[9px] text-text-tertiary truncate max-w-[56px] font-mono">{item.meta}</span>
                      )}
                      {/* drag handle hint */}
                      <GripVertical className="w-3 h-3 text-text-tertiary/40 group-hover:text-text-tertiary/70 shrink-0 transition-colors" />
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>
      ))}

      {/* ── Global Templates ── */}
      <SectionHeader
        label={t('controlCenter.globalTemplates')}
        icon={Box}
        iconColor="text-text-tertiary"
        count={graphTemplates.length}
        open={expanded.globalTemplates}
        onToggle={() => toggle('globalTemplates')}
      />
      {expanded.globalTemplates && (
        <div className="ml-7 mr-2 mb-1">
          {graphTemplates.length === 0 ? (
            <p className="text-[10px] text-text-tertiary px-2 py-1 italic">{t('registry.empty')}</p>
          ) : (
            graphTemplates.map((tpl) => (
              <div
                key={tpl.id}
                onClick={() => workspaceId && handleCloneTemplate(tpl)}
                className={`group flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] text-text-secondary hover:bg-surface-3 transition-colors ${
                  workspaceId ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
                }`}
                title={workspaceId ? 'Click to clone template' : 'Select a workspace first'}
              >
                <span className="truncate flex-1">{tpl.intentPattern}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    if (workspaceId) handleCloneTemplate(tpl)
                  }}
                  disabled={!workspaceId}
                  className={`p-0.5 rounded transition-colors ${
                    workspaceId
                      ? 'hover:bg-accent/10 text-text-tertiary hover:text-accent cursor-pointer'
                      : 'text-text-tertiary/30 cursor-not-allowed'
                  }`}
                >
                  <Copy className="w-3 h-3" />
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function SectionHeader({
  label, icon: Icon, iconColor, count, open, onToggle,
}: {
  label: string
  icon: typeof Zap
  iconColor: string
  count: number
  open: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-medium text-text-secondary hover:bg-surface-2/60 transition-colors cursor-pointer group"
    >
      <ChevronRight className={`w-3 h-3 transition-transform text-text-tertiary/60 group-hover:text-text-tertiary ${open ? 'rotate-90' : ''}`} />
      <Icon className={`w-3.5 h-3.5 shrink-0 ${iconColor}`} />
      <span className="flex-1 text-left">{label}</span>
      <span className="text-[10px] text-text-tertiary tabular-nums">{count}</span>
    </button>
  )
}
