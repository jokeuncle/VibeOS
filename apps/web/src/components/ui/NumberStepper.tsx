import { Minus, Plus } from 'lucide-react'

function clamp(n: number, min?: number, max?: number): number {
  let x = n
  if (min !== undefined) x = Math.max(min, x)
  if (max !== undefined) x = Math.min(max, x)
  return x
}

function buttonStep(integer: boolean, step: number | 'any' | undefined): number {
  if (typeof step === 'number' && step > 0) return step
  return integer ? 1 : 0.1
}

const SIZE = {
  sm: {
    wrap: 'min-h-[32px]',
    btn: 'px-2 min-w-[30px]',
    input: 'py-1.5 text-[11px]',
    icon: 'w-3 h-3',
  },
  md: {
    wrap: 'min-h-[40px]',
    btn: 'px-2.5 min-w-[34px]',
    input: 'py-2 text-sm',
    icon: 'w-3.5 h-3.5',
  },
} as const

export interface NumberStepperProps {
  id?: string
  name?: string
  value: number | undefined | null
  onChange: (v: number | undefined) => void
  onBlur?: () => void
  onFocus?: () => void
  min?: number
  max?: number
  /** Used with `integer` for button deltas when schema has no `multipleOf`. */
  step?: number | 'any'
  integer?: boolean
  disabled?: boolean
  size?: 'sm' | 'md'
  className?: string
}

/**
 * Compact +/- stepper aligned with FormSelect / ControlCenter inputs (no native spinners).
 */
export default function NumberStepper({
  id,
  name,
  value,
  onChange,
  onBlur,
  onFocus,
  min,
  max,
  step,
  integer = false,
  disabled = false,
  size = 'sm',
  className = '',
}: NumberStepperProps) {
  const sz = SIZE[size]
  const num =
    typeof value === 'number' && !Number.isNaN(value) ? value : undefined
  const s = buttonStep(integer, step)

  const bump = (dir: -1 | 1) => {
    const base = num ?? min ?? 0
    let next = base + dir * s
    if (integer) next = Math.round(next)
    else next = Math.round(next * 1e6) / 1e6
    onChange(clamp(next, min, max))
  }

  const atMin = min !== undefined && num !== undefined && num <= min
  const atMax = max !== undefined && num !== undefined && num >= max

  return (
    <div
      className={[
        'flex items-stretch rounded-lg border border-border-subtle bg-surface-2/40 overflow-hidden',
        'shadow-sm transition-colors',
        'focus-within:ring-1 focus-within:ring-accent/35 focus-within:border-accent/40',
        'divide-x divide-border-subtle/70',
        sz.wrap,
        className,
      ].join(' ')}
    >
      <button
        type="button"
        disabled={disabled || atMin}
        aria-label="Decrease"
        className={[
          'flex items-center justify-center shrink-0 text-text-secondary',
          'hover:bg-surface-3/45 hover:text-text-primary',
          'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent',
          sz.btn,
        ].join(' ')}
        onClick={() => bump(-1)}
      >
        <Minus className={sz.icon} strokeWidth={1.5} aria-hidden />
      </button>
      <input
        id={id}
        name={name}
        type="number"
        disabled={disabled}
        min={min}
        max={max}
        step={typeof step === 'number' && step > 0 ? step : integer ? 1 : 'any'}
        value={num === undefined ? '' : num}
        onChange={(e) => {
          const t = e.target.value
          if (t === '') {
            onChange(undefined)
            return
          }
          const n = parseFloat(t)
          if (Number.isNaN(n)) return
          const v = integer ? Math.trunc(n) : n
          onChange(clamp(v, min, max))
        }}
        onBlur={onBlur}
        onFocus={onFocus}
        className={[
          'flex-1 min-w-0 min-h-0 border-0 bg-transparent text-center tabular-nums',
          'text-text-primary placeholder:text-text-tertiary outline-none',
          '[appearance:textfield] [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
          sz.input,
        ].join(' ')}
      />
      <button
        type="button"
        disabled={disabled || atMax}
        aria-label="Increase"
        className={[
          'flex items-center justify-center shrink-0 text-text-secondary',
          'hover:bg-surface-3/45 hover:text-text-primary',
          'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent',
          sz.btn,
        ].join(' ')}
        onClick={() => bump(1)}
      >
        <Plus className={sz.icon} strokeWidth={1.5} aria-hidden />
      </button>
    </div>
  )
}
