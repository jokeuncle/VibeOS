import { useState, useEffect, useRef, useLayoutEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Check } from 'lucide-react'

export interface FormSelectOption {
  value: string
  label: string
}

export interface FormSelectProps {
  value: string
  options: FormSelectOption[]
  placeholder?: string
  onChange: (v: string) => void
  /** Compact for toolbars; default forms. */
  size?: 'sm' | 'md'
  disabled?: boolean
  /** Default true. Set false for inline / toolbar picks. */
  fullWidth?: boolean
  className?: string
  triggerClassName?: string
  /** Renders as muted prefix before value (e.g. filter label). */
  prefix?: ReactNode
  id?: string
  'aria-label'?: string
}

const SIZE = {
  sm: {
    trigger: 'px-2.5 py-1.5 text-[11px] gap-1.5 min-h-[32px]',
    item: 'px-3 py-1.5 text-[11px]',
    chevron: 'w-3 h-3',
    check: 'w-3 h-3',
  },
  md: {
    trigger: 'px-3 py-2 text-sm gap-2 min-h-[40px]',
    item: 'px-3 py-2 text-sm',
    chevron: 'w-3.5 h-3.5',
    check: 'w-3.5 h-3.5',
  },
} as const

type MenuRect = { top: number; left: number; width: number; showAbove: boolean }

function useMenuPosition(
  open: boolean,
  triggerRef: React.RefObject<HTMLElement | null>,
  fullWidth: boolean,
) {
  /** null until measured — avoids one frame at (0,0) when portaling to body */
  const [rect, setRect] = useState<MenuRect | null>(null)

  useLayoutEffect(() => {
    if (!open) {
      setRect(null)
      return
    }
    if (!triggerRef.current) return

    function update() {
      const el = triggerRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight
      const pad = 8
      const menuW = fullWidth ? r.width : Math.max(r.width, 7 * 16)
      let left = r.left
      if (left + menuW > vw - pad) left = Math.max(pad, vw - pad - menuW)
      const spaceBelow = vh - r.bottom - pad
      const estimatedMenu = 220
      const showAbove = spaceBelow < estimatedMenu && r.top > vh - r.bottom
      const top = showAbove ? r.top - pad - estimatedMenu : r.bottom + pad
      setRect({ top, left, width: menuW, showAbove })
    }

    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open, fullWidth, triggerRef])

  return rect
}

export default function FormSelect({
  value,
  options,
  placeholder,
  onChange,
  size = 'md',
  disabled = false,
  fullWidth: fullWidthProp,
  className = '',
  triggerClassName = '',
  prefix,
  id,
  'aria-label': ariaLabel,
}: FormSelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = options.find((o) => o.value === value)
  const sz = SIZE[size]
  const fullWidth = fullWidthProp ?? prefix == null
  const menuPos = useMenuPosition(open, ref, fullWidth)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const pos = menuPos
  const portal =
    open &&
    !disabled &&
    pos != null &&
    typeof document !== 'undefined' &&
    createPortal(
      <>
        <div
          className="fixed inset-0 z-[140]"
          aria-hidden
          onMouseDown={(e) => {
            e.preventDefault()
            setOpen(false)
          }}
        />
        <div
          role="listbox"
          className={`
            fixed z-[150] py-1.5 max-h-60 overflow-y-auto overflow-x-hidden
            bg-surface-2/95 backdrop-blur-md border border-border-default rounded-xl
            shadow-[0_12px_40px_-12px_rgba(0,0,0,0.45)]
            motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-100
          `.trim().replace(/\s+/g, ' ')}
          style={{
            top: pos.top,
            left: pos.left,
            width: pos.width,
            maxWidth: 'min(100vw - 16px, 320px)',
          }}
        >
          {options.map((opt) => {
            const isOn = opt.value === value
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isOn}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(opt.value)
                  setOpen(false)
                }}
                className={`
                  w-full flex items-center justify-between gap-2 rounded-lg mx-1 max-w-[calc(100%-8px)]
                  text-left transition-colors cursor-pointer outline-none
                  ${sz.item}
                  ${isOn ? 'bg-accent/12 text-accent' : 'text-text-secondary hover:bg-surface-3/90'}
                `.trim().replace(/\s+/g, ' ')}
              >
                <span className="truncate">{opt.label}</span>
                {isOn && <Check className={`shrink-0 text-accent ${sz.check}`} aria-hidden />}
              </button>
            )
          })}
        </div>
      </>,
      document.body,
    )

  return (
    <div
      ref={ref}
      className={`relative ${fullWidth ? 'w-full' : 'inline-block align-middle'} ${className}`.trim()}
    >
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onMouseDown={(e) => {
          if (disabled) return
          e.preventDefault()
          setOpen((o) => !o)
        }}
        className={`
          flex items-center justify-between rounded-lg border transition-all outline-none
          bg-surface-2/90 backdrop-blur-sm border-border-subtle
          hover:border-border-default hover:bg-surface-2
          focus-visible:ring-2 focus-visible:ring-accent/35 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0
          shadow-sm
          disabled:opacity-45 disabled:cursor-not-allowed disabled:hover:border-border-subtle
          ${disabled ? '' : 'cursor-pointer'}
          ${fullWidth ? 'w-full' : 'w-max min-w-[7rem] max-w-[min(100vw-2rem,280px)]'}
          ${sz.trigger}
          ${open ? 'border-accent/50 ring-1 ring-accent/20' : ''}
          ${triggerClassName}
        `.trim().replace(/\s+/g, ' ')}
      >
        <span className="flex items-center gap-1.5 min-w-0 flex-1 text-left">
          {prefix != null && prefix !== '' && (
            <span className="text-text-tertiary shrink-0 font-normal">{prefix}:</span>
          )}
          <span
            className={`truncate ${selected ? 'text-text-primary' : 'text-text-quaternary'} ${prefix ? 'font-medium' : ''}`}
          >
            {selected?.label ?? placeholder ?? '—'}
          </span>
        </span>
        <ChevronDown
          className={`shrink-0 text-text-tertiary transition-transform duration-200 ${sz.chevron} ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {portal}
    </div>
  )
}
