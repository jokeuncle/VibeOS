import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { GripVertical } from 'lucide-react'

function readStoredWidth(key: string, fallback: number, min: number, max: number): number {
  try {
    const v = localStorage.getItem(key)
    if (v == null) return fallback
    const n = parseInt(v, 10)
    if (!Number.isFinite(n)) return fallback
    return Math.max(min, Math.min(max, n))
  } catch {
    return fallback
  }
}

export interface ResizableSidebarProps {
  /** Which side the panel is docked to (controls drag direction and handle position). */
  side: 'left' | 'right'
  /** Initial width when nothing is stored (px). */
  defaultWidth: number
  minWidth?: number
  maxWidth?: number
  /** Persist width under this key (localStorage). */
  storageKey?: string
  children: ReactNode
  /** Extra classes on the outer shell (borders, background). */
  className?: string
  /** Classes on the scrollable content wrapper. */
  contentClassName?: string
}

/**
 * Fixed-width sidebar column with a drag handle on the inner edge to resize.
 * Width can be persisted via `storageKey`.
 */
export default function ResizableSidebar({
  side,
  defaultWidth,
  minWidth = 200,
  maxWidth = 520,
  storageKey,
  children,
  className = '',
  contentClassName = '',
}: ResizableSidebarProps) {
  const [width, setWidth] = useState(() =>
    storageKey
      ? readStoredWidth(storageKey, defaultWidth, minWidth, maxWidth)
      : Math.max(minWidth, Math.min(maxWidth, defaultWidth)),
  )
  const dragging = useRef(false)
  const startX = useRef(0)
  const startW = useRef(0)
  const latestW = useRef(width)

  useEffect(() => {
    latestW.current = width
  }, [width])

  const persist = useCallback(() => {
    if (!storageKey) return
    try {
      localStorage.setItem(storageKey, String(latestW.current))
    } catch {
      /* ignore quota */
    }
  }, [storageKey])

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      dragging.current = true
      startX.current = e.clientX
      startW.current = latestW.current
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [],
  )

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current) return
      const dx = e.clientX - startX.current
      const raw = side === 'left' ? startW.current + dx : startW.current - dx
      const next = Math.max(minWidth, Math.min(maxWidth, raw))
      latestW.current = next
      setWidth(next)
    }
    function onUp() {
      if (!dragging.current) return
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      persist()
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [side, minWidth, maxWidth, persist])

  const handleCls =
    'w-2 shrink-0 cursor-col-resize flex items-center justify-center group/handle ' +
    'hover:bg-accent/12 transition-colors'

  const shellBorder = side === 'left' ? 'border-r border-border-subtle' : 'border-l border-border-subtle'

  return (
    <div
      className={`flex h-full min-h-0 shrink-0 overflow-hidden bg-surface-1/30 ${shellBorder} ${className}`.trim()}
      style={{ width }}
    >
      {side === 'right' && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panel"
          onMouseDown={onMouseDown}
          className={handleCls}
        >
          <GripVertical className="w-3 h-3 text-text-tertiary/0 group-hover/handle:text-text-tertiary/60 transition-colors pointer-events-none" />
        </div>
      )}
      <div className={`flex-1 min-w-0 min-h-0 overflow-y-auto overflow-x-hidden ${contentClassName}`.trim()}>
        {children}
      </div>
      {side === 'left' && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panel"
          onMouseDown={onMouseDown}
          className={handleCls}
        >
          <GripVertical className="w-3 h-3 text-text-tertiary/0 group-hover/handle:text-text-tertiary/60 transition-colors pointer-events-none" />
        </div>
      )}
    </div>
  )
}
