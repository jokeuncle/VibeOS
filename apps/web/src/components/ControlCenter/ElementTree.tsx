import { useEffect, useState } from 'react'
import { ChevronRight, Zap, Box, Cpu, GitFork, Plus } from 'lucide-react'
import { registryApi } from '../../lib/api'
import type { RegistryIntent, RegistryCapability, RegistryTaskTemplate } from '../../lib/api'
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
  const [intents, setIntents] = useState<RegistryIntent[]>([])
  const [capabilities, setCapabilities] = useState<RegistryCapability[]>([])
  const [templates, setTemplates] = useState<RegistryTaskTemplate[]>([])
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    intents: true,
    capabilities: true,
    nodeTypes: true,
    templates: false,
  })

  useEffect(() => {
    registryApi.listIntents(false).then(setIntents).catch(() => {})
    registryApi.listCapabilities().then(setCapabilities).catch(() => {})
    registryApi.listTemplates(false).then(setTemplates).catch(() => {})
  }, [])

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
    {
      key: 'templates',
      label: t('registry.tab.templates'),
      icon: Box,
      items: templates.map((t) => ({
        id: t.id,
        name: t.intentPattern,
        meta: t.handlerType,
        dragType: 'template',
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

  return (
    <div className="py-2">
      <div className="px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-text-tertiary/70">
          {t('controlCenter.elements')}
        </span>
      </div>

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
    </div>
  )
}
