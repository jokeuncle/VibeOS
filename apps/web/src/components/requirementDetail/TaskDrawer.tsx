import { useMemo } from 'react'
import * as Tabs from '@radix-ui/react-tabs'
import * as Dialog from '@radix-ui/react-dialog'
import {
  FileText, X, CheckCircle2, Circle, FileCode2, ChevronDown, MessageSquare, Zap,
} from 'lucide-react'
import { translateSeedTaskCopy } from '../../lib/seedTaskI18n'
import { useWorkspaceStore } from '../../stores/workspace'
import { TaskLinksAndAttachments, type TaskRefLink, type TaskLocalFile } from '../TaskLinksAndAttachments'
import { ExecutionRow } from './ExecutionRow'
import type { PhaseType, Task, Artifact } from '../../types'
import { getTaskTypeInfo } from './phaseMeta'
import { PHASE_CHECKLIST, getPhaseDrawerSections } from './phaseStatus'
import { PhaseHintCard } from './PhaseHintCard'
import { PRIORITY_COLORS } from './uiConstants'
import { ArtifactRenderedBody } from '../ArtifactRenderedBody'

export function TaskDrawer({ task, phase, artifacts, open, onClose, t, refLinks, onRefLinksChange, localFiles, onLocalFilesChange }: {
  task: Task | null; phase: PhaseType; artifacts: Artifact[]
  open: boolean; onClose: () => void; t: (k: any) => string
  refLinks: TaskRefLink[]
  onRefLinksChange: (links: TaskRefLink[]) => void
  localFiles: TaskLocalFile[]
  onLocalFilesChange: (files: TaskLocalFile[]) => void
}) {
  const executions = useWorkspaceStore((s) => s.executions)

  const taskExecutions = useMemo(() => {
    if (!task) return []
    return executions.filter((e) => e.taskIds?.includes(task.id))
  }, [task, executions])

  if (!task) return null

  const taskCopy = translateSeedTaskCopy(task.title, task.description, t)
  const typeInfo = getTaskTypeInfo(phase, task)
  const typeLabel = t(`task.type.${typeInfo.key}` as any)
  const taskExecIds = new Set(taskExecutions.map(e => e.id))
  const linkedArtifacts = artifacts.filter(a => a.executionId && taskExecIds.has(a.executionId))
  const checklist = PHASE_CHECKLIST[phase]
  const sections = getPhaseDrawerSections(phase, task, t)

  const statusConfig = task.status === 'completed'
    ? { icon: <CheckCircle2 className="w-4 h-4 text-success" />, cls: 'bg-success/15 text-success' }
    : task.status === 'in_progress'
    ? { icon: <span className="w-4 h-4 rounded-full border-2 border-accent border-t-transparent animate-spin inline-block" />, cls: 'bg-accent/15 text-accent' }
    : { icon: <Circle className="w-4 h-4 text-text-tertiary/50" />, cls: 'bg-surface-3 text-text-tertiary' }

  return (
    <Dialog.Root open={open} onOpenChange={v => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/25 backdrop-blur-[2px] z-[100]" />
        <Dialog.Content
          className="fixed right-0 top-0 h-full w-[440px] max-w-[94vw] bg-surface-1 border-l border-border-default shadow-2xl z-[101] flex flex-col outline-none"
          aria-describedby={undefined}
        >
          <div className="flex items-start gap-3 px-5 pt-5 pb-4 border-b border-border-subtle bg-surface-2/40">
            <div className="mt-0.5 shrink-0">{statusConfig.icon}</div>
            <div className="flex-1 min-w-0">
              <Dialog.Title className="text-sm font-semibold text-text-primary leading-snug mb-2">
                {taskCopy.title}
              </Dialog.Title>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-md border ${typeInfo.color}`}>
                  {typeInfo.icon}
                  {typeLabel}
                </span>
                {task.priority && (
                  <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded uppercase ${PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.p3}`}>
                    {task.priority}
                  </span>
                )}
                <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${statusConfig.cls}`}>
                  {t(`task.status.${task.status}` as any)}
                </span>
              </div>
            </div>
            <Dialog.Close asChild>
              <button type="button" className="p-1.5 rounded-lg hover:bg-surface-3 text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer shrink-0 mt-0.5">
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </div>

          <Tabs.Root key={task.id} defaultValue="detail" className="flex-1 flex flex-col overflow-hidden">
            <Tabs.List className="flex border-b border-border-subtle px-5 bg-surface-1/30 shrink-0">
              {([
                { id: 'detail',     icon: <FileText className="w-3 h-3" />,      label: t('task.detail'),                   count: 0 },
                { id: 'checklist',  icon: <CheckCircle2 className="w-3 h-3" />,  label: t('task.checklist' as any),         count: 0 },
                { id: 'artifacts',  icon: <FileCode2 className="w-3 h-3" />,     label: t('phase.tab.artifacts'),           count: linkedArtifacts.length },
                { id: 'executions', icon: <Zap className="w-3 h-3" />,           label: t('execution.history' as any),      count: taskExecutions.length },
              ] as const).map(tab => (
                <Tabs.Trigger
                  key={tab.id}
                  value={tab.id}
                  className="flex items-center gap-1.5 px-3 py-2.5 text-[11px] font-medium border-b-2 -mb-px transition-colors cursor-pointer outline-none text-text-tertiary border-transparent hover:text-text-secondary data-[state=active]:text-accent data-[state=active]:border-accent"
                >
                  {tab.icon}{tab.label}
                  {tab.count > 0 && (
                    <span className="text-[10px] font-mono opacity-60">({tab.count})</span>
                  )}
                </Tabs.Trigger>
              ))}
            </Tabs.List>

            <div className="flex-1 overflow-y-auto">

              <Tabs.Content value="detail" className="p-5 space-y-5 outline-none">
                {sections.length > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    {sections.map((s, i) => (
                      <div key={i} className="bg-surface-2/40 rounded-lg px-3 py-2 border border-border-subtle">
                        <p className="text-[9px] font-semibold text-text-secondary uppercase tracking-wider mb-1">{s.label}</p>
                        <p className={`text-xs font-medium text-text-primary ${s.mono ? 'font-mono' : ''}`}>{s.value}</p>
                      </div>
                    ))}
                  </div>
                )}

                <div>
                  <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider mb-2">{t('task.description')}</p>
                  {taskCopy.description ? (
                    <div className="text-xs text-text-secondary leading-relaxed bg-surface-2/40 rounded-lg p-3.5 border border-border-subtle whitespace-pre-wrap">
                      {taskCopy.description}
                    </div>
                  ) : (
                    <div className="py-6 text-center rounded-lg border border-dashed border-border-subtle bg-surface-2/30">
                      <MessageSquare className="w-5 h-5 mx-auto mb-2 text-text-tertiary/40" />
                      <p className="text-xs text-text-tertiary">{t('task.descriptionPlaceholder')}</p>
                    </div>
                  )}
                </div>

                <TaskLinksAndAttachments
                  variant="compact"
                  links={refLinks}
                  onLinksChange={onRefLinksChange}
                  files={localFiles}
                  onFilesChange={onLocalFilesChange}
                />

                <PhaseHintCard phase={phase} taskType={typeInfo.key} t={t} />
              </Tabs.Content>

              <Tabs.Content value="checklist" className="p-5 outline-none">
                <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider mb-3">{t('task.doneWhen' as any)}</p>
                <div className="space-y-2">
                  {checklist.map((key, i) => {
                    const isDone = task.status === 'completed'
                    return (
                      <div key={i} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
                        isDone ? 'bg-success/5 border-success/20' : 'bg-surface-2/40 border-border-subtle'
                      }`}>
                        {isDone
                          ? <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                          : <Circle className="w-4 h-4 text-text-tertiary/30 shrink-0" />
                        }
                        <span className={`text-xs ${isDone ? 'text-text-secondary line-through' : 'text-text-primary'}`}>
                          {t(key as any)}
                        </span>
                      </div>
                    )
                  })}
                </div>
                <p className="text-[10px] text-text-tertiary/60 mt-4 text-center">{t('task.checklistHint' as any)}</p>
              </Tabs.Content>

              <Tabs.Content value="executions" className="p-5 space-y-2 outline-none">
                {taskExecutions.length === 0 ? (
                  <div className="py-12 text-center">
                    <Zap className="w-8 h-8 mx-auto mb-3 text-text-tertiary/25" />
                    <p className="text-xs text-text-tertiary">{t('execution.empty.title' as any)}</p>
                    <p className="text-[11px] text-text-tertiary/50 mt-1">{t('execution.empty.desc' as any)}</p>
                  </div>
                ) : (
                  taskExecutions.map((exec) => (
                    <ExecutionRow key={exec.id} execution={exec} t={t} />
                  ))
                )}
              </Tabs.Content>

              <Tabs.Content value="artifacts" className="p-5 space-y-2 outline-none">
                {linkedArtifacts.length === 0 ? (
                  <div className="py-12 text-center">
                    <FileCode2 className="w-8 h-8 mx-auto mb-3 text-text-tertiary/25" />
                    <p className="text-xs text-text-tertiary">{t('phase.noArtifacts')}</p>
                    <p className="text-[11px] text-text-tertiary/50 mt-1">{t('task.artifactsHint' as any)}</p>
                  </div>
                ) : (
                  linkedArtifacts.map(art => (
                    <details key={art.id} className="group bg-surface-2/40 rounded-lg border border-border-subtle overflow-hidden">
                      <summary className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer list-none hover:bg-surface-3/50 transition-colors">
                        <div className="w-6 h-6 rounded bg-accent/10 flex items-center justify-center shrink-0">
                          <FileText className="w-3 h-3 text-accent" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-medium text-text-primary block truncate">{art.title}</span>
                          <span className="text-[10px] text-text-tertiary font-mono">{art.type} · v{art.version}</span>
                        </div>
                        <ChevronDown className="w-3 h-3 text-text-tertiary shrink-0 transition-transform group-open:rotate-180" />
                      </summary>
                      <div className="px-3 pb-3 pt-2 border-t border-border-subtle max-h-80 overflow-y-auto">
                        <ArtifactRenderedBody artifact={art} />
                      </div>
                    </details>
                  ))
                )}
              </Tabs.Content>
            </div>
          </Tabs.Root>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
