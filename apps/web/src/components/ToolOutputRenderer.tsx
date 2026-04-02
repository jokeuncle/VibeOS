import { useState, useMemo } from 'react'
import { ChevronRight, Copy, Check, AlertTriangle } from 'lucide-react'
import { MarkdownContent } from './MessageMarkdown'

type OutputFormat = 'json' | 'markdown' | 'plain' | 'error'

function detectFormat(text: string): OutputFormat {
  const trimmed = text.trim()
  if (!trimmed) return 'plain'
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try { JSON.parse(trimmed); return 'json' } catch { /* fall through */ }
  }
  if (/^#+\s|^\*\*|^[-*]\s|\n#{1,3}\s|```/.test(trimmed)) return 'markdown'
  return 'plain'
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button
      onClick={handleCopy}
      className="p-0.5 rounded text-text-tertiary/50 hover:text-text-secondary transition-colors cursor-pointer"
      title="Copy"
    >
      {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
    </button>
  )
}

function JsonValue({ value, depth = 0 }: { value: unknown; depth?: number }) {
  const [open, setOpen] = useState(depth < 2)

  if (value === null) return <span className="text-text-tertiary italic">null</span>
  if (typeof value === 'boolean') return <span className="text-accent">{String(value)}</span>
  if (typeof value === 'number') return <span className="text-accent">{value}</span>

  if (typeof value === 'string') {
    if (value.length > 120) {
      return <span className="text-success/80" title={value}>"{value.slice(0, 120)}…"</span>
    }
    return <span className="text-success/80">"{value}"</span>
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-text-tertiary">[]</span>
    return (
      <span>
        <button
          onClick={() => setOpen(v => !v)}
          className="inline-flex items-center text-text-tertiary hover:text-text-secondary cursor-pointer"
        >
          <ChevronRight className={`w-3 h-3 transition-transform duration-100 ${open ? 'rotate-90' : ''}`} />
          <span className="text-text-tertiary/60">[{value.length}]</span>
        </button>
        {open && (
          <div className="pl-3 border-l border-border-subtle/30 ml-1">
            {value.map((item, i) => (
              <div key={i} className="flex gap-1 items-start py-px">
                <span className="text-text-tertiary/40 shrink-0 tabular-nums w-3 text-right">{i}</span>
                <JsonValue value={item} depth={depth + 1} />
              </div>
            ))}
          </div>
        )}
      </span>
    )
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0) return <span className="text-text-tertiary">{'{}'}</span>
    return (
      <span>
        <button
          onClick={() => setOpen(v => !v)}
          className="inline-flex items-center text-text-tertiary hover:text-text-secondary cursor-pointer"
        >
          <ChevronRight className={`w-3 h-3 transition-transform duration-100 ${open ? 'rotate-90' : ''}`} />
          <span className="text-text-tertiary/60">{`{${entries.length}}`}</span>
        </button>
        {open && (
          <div className="pl-3 border-l border-border-subtle/30 ml-1">
            {entries.map(([k, v]) => (
              <div key={k} className="flex gap-1 items-start py-px">
                <span className="text-warning/70 shrink-0">"{k}":</span>
                <JsonValue value={v} depth={depth + 1} />
              </div>
            ))}
          </div>
        )}
      </span>
    )
  }

  return <span className="text-text-tertiary">{String(value)}</span>
}

function JsonTreeView({ text, comfortable }: { text: string; comfortable?: boolean }) {
  const parsed = useMemo(() => {
    try { return JSON.parse(text) } catch { return null }
  }, [text])

  if (parsed === null) return <PlainView text={text} comfortable={comfortable} />

  const maxH = comfortable ? 'max-h-[min(70vh,28rem)]' : 'max-h-64'
  return (
    <div className={`text-[10px] font-mono leading-relaxed bg-surface-2/30 rounded-md px-2 py-1.5 overflow-y-auto ${maxH}`}>
      <JsonValue value={parsed} />
    </div>
  )
}

function PlainView({ text, comfortable }: { text: string; comfortable?: boolean }) {
  const lines = text.split('\n')
  const truncated = !comfortable && lines.length > 12
  const display = truncated ? lines.slice(0, 12).join('\n') + '\n…' : text
  const maxH = comfortable ? 'max-h-[min(70vh,28rem)]' : 'max-h-64'

  return (
    <pre className={`text-[10px] font-mono text-text-secondary leading-relaxed whitespace-pre-wrap break-all bg-surface-2/30 rounded-md px-2 py-1.5 overflow-y-auto ${maxH}`}>
      {display}
    </pre>
  )
}

function MarkdownView({ text, comfortable }: { text: string; comfortable?: boolean }) {
  const maxH = comfortable ? 'max-h-[min(70vh,28rem)]' : 'max-h-64'
  return (
    <div className={`bg-surface-2/30 rounded-md px-2.5 py-1.5 overflow-y-auto tool-output-md ${maxH}`}>
      <MarkdownContent text={text} />
    </div>
  )
}

function ErrorView({ text }: { text: string }) {
  return (
    <div className="flex gap-1.5 items-start bg-danger/[0.04] border border-danger/15 rounded-md px-2.5 py-1.5">
      <AlertTriangle className="w-3 h-3 text-danger shrink-0 mt-0.5" />
      <pre className="text-[10px] font-mono text-danger/80 leading-relaxed whitespace-pre-wrap break-all flex-1">
        {text}
      </pre>
    </div>
  )
}

export function ToolOutputRenderer({
  text,
  isError = false,
  /** Larger scroll area, no plain-text line cap — for artifact panels etc. */
  variant = 'compact',
}: {
  text: string
  isError?: boolean
  variant?: 'compact' | 'comfortable'
}) {
  if (isError) return <ErrorView text={text} />

  const format = detectFormat(text)
  const comfortable = variant === 'comfortable'

  return (
    <div className="relative group/output">
      <div className="absolute top-1 right-1 opacity-0 group-hover/output:opacity-100 transition-opacity z-10">
        <CopyButton text={text} />
      </div>
      {format === 'json' && <JsonTreeView text={text} comfortable={comfortable} />}
      {format === 'markdown' && <MarkdownView text={text} comfortable={comfortable} />}
      {format === 'plain' && <PlainView text={text} comfortable={comfortable} />}
    </div>
  )
}

export function ToolInputRenderer({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data)
  if (entries.length === 0) return null

  const isSimple = entries.length <= 3 && entries.every(
    ([, v]) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean',
  )

  if (isSimple) {
    return (
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] font-mono bg-surface-2/30 rounded-md px-2 py-1.5">
        {entries.map(([k, v]) => (
          <span key={k}>
            <span className="text-warning/70">{k}</span>
            <span className="text-text-tertiary">=</span>
            <span className="text-text-secondary">{String(v)}</span>
          </span>
        ))}
      </div>
    )
  }

  return (
    <div className="text-[10px] font-mono leading-relaxed bg-surface-2/30 rounded-md px-2 py-1.5 max-h-48 overflow-y-auto">
      <JsonValue value={data} />
    </div>
  )
}
