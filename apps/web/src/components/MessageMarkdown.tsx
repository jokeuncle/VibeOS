import { useMemo } from 'react'
import { Code2 } from 'lucide-react'

function InlineText({ text }: { text: string }) {
  const parts: React.ReactNode[] = []
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index))
    if (match[2]) parts.push(<strong key={key++} className="font-semibold">{match[2]}</strong>)
    else if (match[3]) parts.push(<em key={key++} className="italic">{match[3]}</em>)
    else if (match[4]) parts.push(<code key={key++} className="px-1 py-0.5 rounded bg-surface-3 font-mono text-[11px] text-accent">{match[4]}</code>)
    else if (match[5] && match[6]) parts.push(<a key={key++} href={match[6]} target="_blank" rel="noreferrer" className="text-accent hover:underline">{match[5]}</a>)
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return <>{parts}</>
}

function InlineMarkdown({ text }: { text: string }) {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let listItems: string[] = []
  let listStart = 0

  function flushList() {
    if (listItems.length === 0) return
    elements.push(
      <ul key={`list-${listStart}`} className="list-disc list-inside space-y-0.5 pl-1">
        {listItems.map((item, j) => <li key={j}><InlineText text={item} /></li>)}
      </ul>
    )
    listItems = []
  }

  lines.forEach((line, i) => {
    const trimmed = line.trimStart()
    if (trimmed.startsWith('### ')) {
      flushList()
      elements.push(<h4 key={i} className="text-xs font-bold text-text-primary mt-3 mb-1">{trimmed.slice(4)}</h4>)
    } else if (trimmed.startsWith('## ')) {
      flushList()
      elements.push(<h3 key={i} className="text-sm font-bold text-text-primary mt-3 mb-1">{trimmed.slice(3)}</h3>)
    } else if (trimmed.startsWith('# ')) {
      flushList()
      elements.push(<h2 key={i} className="text-base font-bold text-text-primary mt-3 mb-1">{trimmed.slice(2)}</h2>)
    } else if (/^[-*]\s/.test(trimmed)) {
      if (listItems.length === 0) listStart = i
      listItems.push(trimmed.slice(2))
    } else if (/^\d+\.\s/.test(trimmed)) {
      if (listItems.length === 0) listStart = i
      listItems.push(trimmed.replace(/^\d+\.\s/, ''))
    } else {
      flushList()
      if (trimmed === '') {
        if (i > 0 && i < lines.length - 1) elements.push(<div key={i} className="h-2" />)
      } else {
        elements.push(<p key={i} className="whitespace-pre-wrap"><InlineText text={line} /></p>)
      }
    }
  })
  flushList()
  return <>{elements}</>
}

export function MarkdownContent({ text }: { text: string }) {
  const parts = useMemo(() => {
    const result: { type: 'text' | 'code'; content: string; lang?: string }[] = []
    const codeBlockRe = /```(\w*)\n([\s\S]*?)```/g
    let lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = codeBlockRe.exec(text)) !== null) {
      if (match.index > lastIndex) result.push({ type: 'text', content: text.slice(lastIndex, match.index) })
      result.push({ type: 'code', content: match[2], lang: match[1] || undefined })
      lastIndex = match.index + match[0].length
    }
    if (lastIndex < text.length) result.push({ type: 'text', content: text.slice(lastIndex) })
    return result
  }, [text])

  return (
    <div className="text-xs text-text-primary/90 leading-relaxed space-y-2">
      {parts.map((part, i) => {
        if (part.type === 'code') {
          return (
            <div key={i} className="rounded-lg border border-border-subtle overflow-hidden">
              {part.lang && (
                <div className="flex items-center gap-2 px-3 py-1 bg-surface-3 border-b border-border-subtle">
                  <Code2 className="w-3 h-3 text-text-tertiary" />
                  <span className="text-[10px] font-mono text-text-tertiary">{part.lang}</span>
                </div>
              )}
              <pre className="p-3 bg-surface-2/50 overflow-x-auto">
                <code className="text-[11px] font-mono text-text-primary leading-relaxed whitespace-pre">{part.content}</code>
              </pre>
            </div>
          )
        }
        return <InlineMarkdown key={i} text={part.content} />
      })}
    </div>
  )
}
