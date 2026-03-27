import { Circle, Cpu, Clock } from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspace'
import { useT } from '../i18n'

export default function StatusBar() {
  const { activeWorkspaceId, workspaces } = useWorkspaceStore()
  const t = useT()
  const workspace = workspaces.find((w) => w.id === activeWorkspaceId)

  const activeAgents =
    workspace?.agents.filter((a) => a.status === 'running').length ?? 0
  const currentPhase = workspace?.phases.find(
    (p) => p.id === workspace.currentPhaseId,
  )
  const completedPhases =
    workspace?.phases.filter((p) => p.status === 'completed').length ?? 0
  const totalPhases = workspace?.phases.length ?? 0

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return t('time.justNow')
    if (mins < 60) return `${mins}${t('time.mAgo')}`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}${t('time.hAgo')}`
    return `${Math.floor(hrs / 24)}${t('time.dAgo')}`
  }

  return (
    <footer className="h-7 flex items-center justify-between px-4 border-t border-border-subtle bg-surface-1/60 text-[11px] font-mono text-text-tertiary">
      <div className="flex items-center gap-4">
        {workspace ? (
          <>
            <span className="flex items-center gap-1.5">
              <Circle className="w-2.5 h-2.5 fill-accent text-accent" />
              {t('statusbar.phase')}{' '}
              {completedPhases +
                (currentPhase?.status === 'in_progress' ? 1 : 0)}
              /{totalPhases}
              {currentPhase && (
                <span className="text-text-secondary ml-1">
                  {currentPhase.name}
                </span>
              )}
            </span>
            <span className="flex items-center gap-1.5">
              <Cpu className="w-2.5 h-2.5" />
              {activeAgents}{' '}
              {activeAgents === 1
                ? t('statusbar.agentActive_one')
                : t('statusbar.agentActive_other')}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="w-2.5 h-2.5" />
              {timeAgo(workspace.updatedAt)}
            </span>
          </>
        ) : (
          <span>
            {workspaces.length}{' '}
            {workspaces.length === 1
              ? t('statusbar.workspace_one')
              : t('statusbar.workspace_other')}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-text-tertiary/60">AnyOS v0.1.0</span>
      </div>
    </footer>
  )
}
