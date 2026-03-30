import { useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { ExecutionTimelineBlock } from './NlpInteractionBlocks'
import type { RichBlock } from '../types'

type WorkspaceCreateSlots = {
  naming?: string
  title?: string | null
  description?: string | null
}

/** 首页助手：轻量「过程」折叠，中文文案，避免厚重卡片感 */
export function HomeReasoningPanel({
  timelineBlock,
  intentBlock,
  isStreaming,
}: {
  timelineBlock?: RichBlock
  intentBlock?: RichBlock
  isStreaming: boolean
}) {
  const [open, setOpen] = useState(isStreaming)

  const steps = timelineBlock?.steps ?? []
  const wc = intentBlock?.nluSlots?.workspace_create as WorkspaceCreateSlots | undefined

  useEffect(() => {
    if (isStreaming) setOpen(true)
  }, [isStreaming])

  if (!timelineBlock && !intentBlock) return null

  const summaryLine = (() => {
    if (!intentBlock) return null
    const parts: string[] = []
    parts.push(intentBlock.intentLabel || '')
    if (wc?.title) parts.push(`名叫「${wc.title}」`)
    if (wc?.description) parts.push(wc.description)
    const body = parts.filter(Boolean).join('，')
    if (!body) return null
    return `大概是：${body}。`
  })()

  return (
    <div className="text-[11px] leading-relaxed">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer inline-flex items-center gap-1 -ml-0.5 py-0.5"
      >
        <ChevronRight
          className={`w-3.5 h-3.5 shrink-0 opacity-70 transition-transform duration-200 ease-out ${
            open ? 'rotate-90' : ''
          }`}
          aria-hidden
        />
        <span>{open ? '收起' : '看一下怎么理解的'}</span>
      </button>

      {open && (
        <div className="mt-1.5 ml-0.5 pl-3 border-l border-border-subtle/55 space-y-2.5 text-text-secondary/95">
          {timelineBlock && steps.length > 0 && (
            <ExecutionTimelineBlock
              block={timelineBlock}
              compact
              bare
              zhOnlyLabels
            />
          )}
          {summaryLine && (
            <p className="text-[11px] text-text-secondary/90 pr-1">{summaryLine}</p>
          )}
        </div>
      )}
    </div>
  )
}
