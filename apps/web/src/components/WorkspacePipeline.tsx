import { GitBranch } from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspace'
import { useT } from '../i18n'
import { useRegisterNlpContext } from '../hooks/useNlpContext'
import { PIPELINE_COMMANDS, type NlpContextDescriptor } from '../lib/nlpContext'
import ControlCenter from './ControlCenter/ControlCenter'
import GraphToolbar from './ControlCenter/GraphToolbar'

export default function WorkspacePipeline() {
  const t = useT()
  const { activeWorkspaceId } = useWorkspaceStore()

  const nlpDesc: NlpContextDescriptor | null = activeWorkspaceId ? {
    id: 'view:pipeline',
    type: 'pipeline',
    priority: 20,
    label: t('sidebar.pipeline'),
    agentType: 'pm',
    agentLabel: t('agent.name.pm'),
    contextPayload: { view: 'pipeline' },
    commands: PIPELINE_COMMANDS,
    placeholderKey: 'command.placeholderNLP',
    intentHints: ['deploy', 'trigger_build', 'view_build_log', 'rollback'],
  } : null
  useRegisterNlpContext(nlpDesc)

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="shrink-0 px-5 py-3 border-b border-border-subtle">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <GitBranch className="w-4 h-4 text-accent" />
            <h1 className="text-sm font-semibold text-text-primary">{t('pipeline.title')}</h1>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1.5 min-w-0 flex-1 sm:flex-none sm:justify-end mr-2 sm:mr-3">
            <GraphToolbar />
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <ControlCenter hideHeader />
      </div>
    </div>
  )
}
