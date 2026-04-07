import { useEffect } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { useT } from '../../i18n'
import { registryApi } from '../../lib/api'
import { useWorkspaceStore } from '../../stores/workspace'
import { useGraphStore } from './useGraphStore'
import ElementTree from './ElementTree'
import GraphCanvas from './GraphCanvas'
import NodeConfigPanel from './NodeConfigPanel'
import PhaseContextPanel from './PhaseContextPanel'
import GraphToolbar from './GraphToolbar'
import ResizableSidebar from '../ui/ResizableSidebar'

import '@xyflow/react/dist/style.css'

interface ControlCenterProps {
  hideHeader?: boolean
}

export default function ControlCenter({ hideHeader = false }: ControlCenterProps) {
  const t = useT()
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const setTemplates = useGraphStore((s) => s.setTemplates)
  const setWorkspaceId = useGraphStore((s) => s.setWorkspaceId)
  const loadWorkspaceGraph = useGraphStore((s) => s.loadWorkspaceGraph)
  const loadWorkspaceGraphs = useGraphStore((s) => s.loadWorkspaceGraphs)
  const loadProjectGraph = useGraphStore((s) => s.loadProjectGraph)
  const consumePendingLoad = useGraphStore((s) => s.consumePendingLoad)
  const graphScope = useGraphStore((s) => s.graphScope)
  const setGraphScope = useGraphStore((s) => s.setGraphScope)
  const currentWsId = useGraphStore((s) => s.workspaceId)

  useEffect(() => {
    registryApi.listTemplates(false).then((list) => {
      const graphTemplates = list
        .filter((t) => t.handlerType === 'graph' || (t.graphDef && Object.keys(t.graphDef).length > 0))
        .map((t) => ({ id: t.id, intentPattern: t.intentPattern, handlerType: t.handlerType }))
      setTemplates(graphTemplates)
    }).catch(() => {})
  }, [setTemplates])

  useEffect(() => {
    const pending = consumePendingLoad()
    if (pending) {
      setWorkspaceId(pending.wsId)
      loadWorkspaceGraphs(pending.wsId)
      loadWorkspaceGraph(pending.wsId, pending.graphId)
      return
    }
    if (!activeWorkspaceId || activeWorkspaceId === currentWsId) return
    setWorkspaceId(activeWorkspaceId)
    loadWorkspaceGraphs(activeWorkspaceId, graphScope)
    if (graphScope === 'project') {
      loadProjectGraph(activeWorkspaceId)
    } else {
      loadWorkspaceGraph(activeWorkspaceId)
    }
  }, [activeWorkspaceId, currentWsId, graphScope, setWorkspaceId, loadWorkspaceGraph, loadWorkspaceGraphs, loadProjectGraph, consumePendingLoad])

  const handleScopeChange = (scope: 'phase' | 'project') => {
    setGraphScope(scope)
    if (!activeWorkspaceId) return
    loadWorkspaceGraphs(activeWorkspaceId, scope)
    if (scope === 'project') {
      loadProjectGraph(activeWorkspaceId)
    } else {
      loadWorkspaceGraph(activeWorkspaceId)
    }
  }

  return (
    <ReactFlowProvider>
      <div className="flex flex-col flex-1 min-h-0 min-w-0 w-full">
        {/* Header - 可通过 hideHeader 隐藏 */}
        {!hideHeader && (
          <div className="shrink-0 px-5 py-3 border-b border-border-subtle flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-sm font-semibold text-text-primary">{t('controlCenter.title')}</h1>
                <p className="text-[11px] text-text-tertiary mt-0.5">{t('controlCenter.desc')}</p>
              </div>
              <div className="flex rounded-md border border-border-subtle overflow-hidden text-[11px] font-medium">
                <button
                  className={`px-3 py-1 transition-colors ${graphScope === 'phase' ? 'bg-accent text-white' : 'bg-surface-2/40 text-text-secondary hover:bg-surface-2/60'}`}
                  onClick={() => handleScopeChange('phase')}
                >
                  Phase
                </button>
                <button
                  className={`px-3 py-1 transition-colors ${graphScope === 'project' ? 'bg-accent text-white' : 'bg-surface-2/40 text-text-secondary hover:bg-surface-2/60'}`}
                  onClick={() => handleScopeChange('project')}
                >
                  Project
                </button>
              </div>
            </div>
            <GraphToolbar />
          </div>
        )}

        {/* 3-panel layout — sidebars resizable (width persisted in localStorage) */}
        <div className="flex flex-1 min-h-0">
          <ResizableSidebar
            side="left"
            defaultWidth={264}
            minWidth={220}
            maxWidth={440}
            storageKey="vibeos.controlCenter.elementsWidth"
            contentClassName="pb-16"
          >
            <ElementTree />
          </ResizableSidebar>

          <div className="flex-1 min-w-0 relative">
            <GraphCanvas />
          </div>

          <ResizableSidebar
            side="right"
            defaultWidth={300}
            minWidth={240}
            maxWidth={480}
            storageKey="vibeos.controlCenter.configWidth"
          >
            <NodeConfigPanel />
            {graphScope === 'project' && (
              <div className="border-t border-border-subtle">
                <PhaseContextPanel />
              </div>
            )}
          </ResizableSidebar>
        </div>
      </div>
    </ReactFlowProvider>
  )
}
