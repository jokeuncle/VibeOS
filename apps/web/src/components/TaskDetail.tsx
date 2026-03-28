import { useState, useEffect, useMemo } from 'react'
import { CheckCircle2, Circle, Loader2, Eye, Pencil, Paperclip, Upload, User, Send } from 'lucide-react'
import { marked } from 'marked'
import SlideOver from './ui/SlideOver'
import DatePicker from './ui/DatePicker'
import AgentLogStream from './AgentLogStream'
import { useUIStore } from '../stores/ui'
import { useWorkspaceStore } from '../stores/workspace'
import { useT } from '../i18n'
import { LABEL_COLORS, type PhaseStatus, type TaskPriority, type LabelColor, type TaskComment, type TaskAttachment } from '../types'
import type { TranslationKey } from '../i18n/en'

const STATUSES: PhaseStatus[] = ['pending', 'in_progress', 'completed']
const PRIORITIES: (TaskPriority | '')[] = ['', 'p0', 'p1', 'p2', 'p3']

const PRIORITY_STYLE: Record<TaskPriority, { bg: string; text: string }> = {
  p0: { bg: 'border-red-500/30 bg-red-500/10', text: 'text-red-400' },
  p1: { bg: 'border-orange-500/30 bg-orange-500/10', text: 'text-orange-400' },
  p2: { bg: 'border-yellow-500/30 bg-yellow-500/10', text: 'text-yellow-400' },
  p3: { bg: 'border-blue-500/30 bg-blue-500/10', text: 'text-blue-400' },
}

const LABEL_DOT: Record<string, string> = {
  red: 'bg-red-400', orange: 'bg-orange-400', yellow: 'bg-yellow-400',
  green: 'bg-green-400', blue: 'bg-blue-400', purple: 'bg-purple-400',
}

const LABEL_RING: Record<string, string> = {
  red: 'ring-red-400', orange: 'ring-orange-400', yellow: 'ring-yellow-400',
  green: 'ring-green-400', blue: 'ring-blue-400', purple: 'ring-purple-400',
}

function StatusIcon({ status }: { status: PhaseStatus }) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="w-3.5 h-3.5 text-success" />
    case 'in_progress':
      return <Loader2 className="w-3.5 h-3.5 text-accent" />
    default:
      return <Circle className="w-3.5 h-3.5 text-text-tertiary" />
  }
}

export default function TaskDetail() {
  const t = useT()
  const { taskDetailOpen, taskDetailPhaseId, taskDetailTaskId, closeTaskDetail, addToast } = useUIStore()
  const { activeWorkspaceId, workspaces, updateTask, addActivity } = useWorkspaceStore()

  const workspace = workspaces.find((w) => w.id === activeWorkspaceId)
  const phase = workspace?.phases.find((p) => p.id === taskDetailPhaseId)
  const task = phase?.tasks.find((t) => t.id === taskDetailTaskId)

  const [title, setTitle] = useState('')
  const [status, setStatus] = useState<PhaseStatus>('pending')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<TaskPriority | ''>('')
  const [labels, setLabels] = useState<LabelColor[]>([])
  const [dueDate, setDueDate] = useState('')
  const [previewMode, setPreviewMode] = useState(false)
  const [commentsMap, setCommentsMap] = useState<Record<string, TaskComment[]>>({})
  const [commentText, setCommentText] = useState('')
  const [attachmentsMap, setAttachmentsMap] = useState<Record<string, TaskAttachment[]>>({})

  const taskKey = taskDetailTaskId || ''
  const comments = commentsMap[taskKey] || []
  const attachments = attachmentsMap[taskKey] || []

  useEffect(() => {
    if (task) {
      setTitle(task.title)
      setStatus(task.status)
      setDescription(task.description || '')
      setPriority(task.priority || '')
      setLabels(task.labels || [])
      setDueDate(task.dueDate || '')
      setPreviewMode(false)
    }
  }, [task])

  const renderedMarkdown = useMemo(() => {
    if (!description) return ''
    return marked.parse(description, { async: false }) as string
  }, [description])

  function addComment() {
    if (!commentText.trim()) return
    setCommentsMap((prev) => ({
      ...prev,
      [taskKey]: [...(prev[taskKey] || []), {
        id: `c-${Date.now()}`,
        author: t('comment.you'),
        content: commentText.trim(),
        timestamp: new Date().toISOString(),
      }],
    }))
    setCommentText('')
  }

  function toggleLabel(c: LabelColor) {
    setLabels((prev) => prev.includes(c) ? prev.filter((l) => l !== c) : [...prev, c])
  }

  function handleSave() {
    if (!activeWorkspaceId || !taskDetailPhaseId || !taskDetailTaskId || !title.trim()) return
    updateTask(activeWorkspaceId, taskDetailPhaseId, taskDetailTaskId, {
      title: title.trim(),
      status,
      description,
      ...(priority ? { priority } : {}),
      labels,
      dueDate: dueDate || undefined,
    })
    addActivity(activeWorkspaceId, {
      type: 'task_updated',
      description: `"${title.trim()}" updated`,
    })
    addToast({ type: 'success', message: t('task.updated') })
    closeTaskDetail()
  }

  return (
    <SlideOver open={taskDetailOpen} onClose={closeTaskDetail} title={t('task.detail')}>
      {task && (
        <div className="space-y-5">
          {/* Title */}
          <div>
            <label className="text-xs font-medium text-text-tertiary mb-1.5 block">{t('task.title')}</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-border-default text-sm text-text-primary outline-none focus:border-accent/40 transition-colors"
            />
          </div>

          {/* Status */}
          <div>
            <label className="text-xs font-medium text-text-tertiary mb-1.5 block">{t('task.status')}</label>
            <div className="flex gap-2">
              {STATUSES.map((s) => {
                const key = `status.${s}` as TranslationKey
                return (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border cursor-pointer transition-all ${
                      status === s
                        ? s === 'completed' ? 'border-success/30 bg-success/10 text-success'
                          : s === 'in_progress' ? 'border-accent/30 bg-accent/10 text-accent'
                            : 'border-border-strong bg-surface-3 text-text-primary'
                        : 'border-border-subtle bg-surface-1 text-text-tertiary hover:bg-surface-2'
                    }`}
                  >
                    <StatusIcon status={s} />
                    {t(key)}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Priority */}
          <div>
            <label className="text-xs font-medium text-text-tertiary mb-1.5 block">{t('priority.label')}</label>
            <div className="flex gap-1.5 flex-wrap">
              {PRIORITIES.map((p) => {
                const label = p ? t(`priority.${p}` as TranslationKey) : t('priority.none')
                const isActive = priority === p
                const style = p && PRIORITY_STYLE[p]
                return (
                  <button
                    key={p}
                    onClick={() => setPriority(p)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border cursor-pointer transition-all ${
                      isActive
                        ? style ? `${style.bg} ${style.text}` : 'border-border-strong bg-surface-3 text-text-primary'
                        : 'border-border-subtle bg-surface-1 text-text-tertiary hover:bg-surface-2'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Labels */}
          <div>
            <label className="text-xs font-medium text-text-tertiary mb-1.5 block">{t('label.title')}</label>
            <div className="flex gap-2">
              {LABEL_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => toggleLabel(c)}
                  className={`w-6 h-6 rounded-full ${LABEL_DOT[c]} cursor-pointer transition-all ${
                    labels.includes(c) ? `ring-2 ring-offset-2 ring-offset-surface-1 ${LABEL_RING[c]}` : 'opacity-40 hover:opacity-80'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Due date */}
          <div>
            <label className="text-xs font-medium text-text-tertiary mb-1.5 block">{t('dueDate.label')}</label>
            <DatePicker
              value={dueDate}
              onChange={setDueDate}
              placeholder={t('dueDate.none')}
            />
          </div>

          {/* Assigned Agent */}
          {task.assignedAgent && (
            <div>
              <label className="text-xs font-medium text-text-tertiary mb-1.5 block">{t('task.assignedAgent')}</label>
              <div className="px-3 py-2 rounded-lg bg-surface-2 border border-border-subtle text-xs text-accent font-mono">
                {task.assignedAgent}
              </div>
            </div>
          )}

          {/* Description (Markdown) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-text-tertiary">{t('task.description')}</label>
              <div className="flex items-center bg-surface-2 rounded-md p-0.5 border border-border-subtle">
                <button
                  onClick={() => setPreviewMode(false)}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium cursor-pointer transition-all flex items-center gap-1 ${
                    !previewMode ? 'bg-surface-4 text-text-primary' : 'text-text-tertiary'
                  }`}
                >
                  <Pencil className="w-2.5 h-2.5" />
                  {t('markdown.edit')}
                </button>
                <button
                  onClick={() => setPreviewMode(true)}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium cursor-pointer transition-all flex items-center gap-1 ${
                    previewMode ? 'bg-surface-4 text-text-primary' : 'text-text-tertiary'
                  }`}
                >
                  <Eye className="w-2.5 h-2.5" />
                  {t('markdown.preview')}
                </button>
              </div>
            </div>

            {previewMode ? (
              <div
                className="markdown-body w-full min-h-[120px] px-3 py-2 rounded-lg bg-surface-2 border border-border-default text-sm text-text-primary"
                dangerouslySetInnerHTML={{ __html: renderedMarkdown || `<span style="color: var(--color-text-tertiary)">${t('task.descriptionPlaceholder')}</span>` }}
              />
            ) : (
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('task.descriptionPlaceholder')}
                rows={5}
                className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-border-default text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent/40 transition-colors resize-none font-mono"
              />
            )}
          </div>

          {/* Attachments */}
          <div>
            <label className="text-xs font-medium text-text-tertiary mb-1.5 flex items-center gap-1.5">
              <Paperclip className="w-3 h-3" />
              {t('attachment.title')}
            </label>
            {attachments.length > 0 && (
              <div className="space-y-1 mb-2">
                {attachments.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface-2 border border-border-subtle text-xs">
                    <Paperclip className="w-3 h-3 text-text-tertiary" />
                    <span className="text-text-primary flex-1 truncate">{a.name}</span>
                    <span className="text-text-tertiary font-mono">{a.size}</span>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => {
                setAttachmentsMap((prev) => {
                  const existing = prev[taskKey] || []
                  return {
                    ...prev,
                    [taskKey]: [...existing, {
                      id: `att-${Date.now()}`,
                      name: `document-${existing.length + 1}.pdf`,
                      size: `${Math.floor(Math.random() * 900 + 100)} KB`,
                    }],
                  }
                })
              }}
              className="w-full py-3 border-2 border-dashed border-border-default rounded-lg text-xs text-text-tertiary hover:border-accent/30 hover:text-accent transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" />
              {t('attachment.drop')}
            </button>
          </div>

          {/* Comments */}
          <div>
            <label className="text-xs font-medium text-text-tertiary mb-2 block">
              {t('comment.title')}
            </label>
            <div className="space-y-3 mb-3 max-h-[180px] overflow-y-auto">
              {comments.length === 0 && (
                <p className="text-[11px] text-text-tertiary text-center py-3">{t('comment.empty')}</p>
              )}
              {comments.map((c) => (
                <div key={c.id} className="flex gap-2">
                  <div className="w-6 h-6 rounded-full bg-surface-3 flex items-center justify-center shrink-0 mt-0.5">
                    <User className="w-3 h-3 text-text-tertiary" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-medium text-text-secondary">{c.author}</span>
                      <span className="text-[10px] font-mono text-text-tertiary">
                        {new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-xs text-text-primary leading-relaxed mt-0.5">{c.content}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && commentText.trim()) addComment()
                }}
                placeholder={t('comment.placeholder')}
                className="flex-1 px-3 py-1.5 rounded-lg bg-surface-2 border border-border-default text-xs text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent/40 transition-colors"
              />
              {commentText.trim() && (
                <button
                  onClick={addComment}
                  className="px-2.5 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white cursor-pointer transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Task Execution Log */}
          <AgentLogStream agents={workspace?.agents || []} taskId={taskDetailTaskId || undefined} />

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleSave}
              className="flex-1 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium cursor-pointer transition-colors"
            >
              {t('task.save')}
            </button>
            <button
              onClick={closeTaskDetail}
              className="px-4 py-2 rounded-lg bg-surface-3 hover:bg-surface-4 text-text-secondary text-sm font-medium cursor-pointer transition-colors"
            >
              {t('task.cancel')}
            </button>
          </div>
        </div>
      )}
    </SlideOver>
  )
}
