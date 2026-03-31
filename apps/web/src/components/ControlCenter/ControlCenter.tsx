import { useEffect } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { useT } from '../../i18n'
import { registryApi } from '../../lib/api'
import { useGraphStore } from './useGraphStore'
import ElementTree from './ElementTree'
import GraphCanvas from './GraphCanvas'
import NodeConfigPanel from './NodeConfigPanel'
import GraphToolbar from './GraphToolbar'

import '@xyflow/react/dist/style.css'

export default function ControlCenter() {
  const t = useT()
  const setTemplates = useGraphStore((s) => s.setTemplates)

  useEffect(() => {
    registryApi.listTemplates(false).then((list) => {
      const graphTemplates = list
        .filter((t) => t.handlerType === 'graph' || (t.graphDef && Object.keys(t.graphDef).length > 0))
        .map((t) => ({ id: t.id, intentPattern: t.intentPattern, handlerType: t.handlerType }))
      setTemplates(graphTemplates)
    }).catch(() => {})
  }, [setTemplates])

  return (
    <ReactFlowProvider>
      <div className="flex flex-col h-full -mx-8 -mt-6 -mb-8">
        {/* Header */}
        <div className="shrink-0 px-5 py-3 border-b border-border-subtle flex items-center justify-between">
          <div>
            <h1 className="text-sm font-semibold text-text-primary">{t('controlCenter.title')}</h1>
            <p className="text-[11px] text-text-tertiary mt-0.5">{t('controlCenter.desc')}</p>
          </div>
          <GraphToolbar />
        </div>

        {/* 3-panel layout */}
        <div className="flex flex-1 min-h-0">
          {/* Left: Element Tree */}
          <div className="w-56 shrink-0 border-r border-border-subtle overflow-y-auto bg-surface-1/30">
            <ElementTree />
          </div>

          {/* Center: Graph Canvas */}
          <div className="flex-1 min-w-0 relative">
            <GraphCanvas />
          </div>

          {/* Right: Config Panel */}
          <div className="w-64 shrink-0 border-l border-border-subtle overflow-y-auto bg-surface-1/30">
            <NodeConfigPanel />
          </div>
        </div>
      </div>
    </ReactFlowProvider>
  )
}
