/**
 * RJSF custom widgets styled with project Tailwind tokens.
 *
 * Each widget maps to a JSON Schema field type / format.
 * Pass this `widgets` object to <Form widgets={widgets} />.
 */

import type { WidgetProps } from '@rjsf/utils'
import NumberStepper from '../../components/ui/NumberStepper'

const inputBase =
  'w-full px-2 py-1.5 rounded-lg bg-surface-1/50 border border-border-subtle text-[11px] ' +
  'text-text-primary placeholder:text-text-tertiary/80 outline-none focus:border-accent/35 transition-colors'

export function TextWidget({ id, value, onChange, onBlur, onFocus, placeholder, disabled, readonly, options }: WidgetProps) {
  return (
    <input
      id={id}
      type="text"
      className={inputBase}
      value={value ?? ''}
      placeholder={(options?.placeholder as string | undefined) ?? placeholder}
      disabled={disabled || readonly}
      maxLength={(options?.maxLength as number | undefined) ?? 200}
      onChange={(e) => onChange(e.target.value === '' ? options?.emptyValue : e.target.value)}
      onBlur={() => onBlur(id, value)}
      onFocus={() => onFocus(id, value)}
    />
  )
}

export function TextareaWidget({ id, value, onChange, onBlur, onFocus, placeholder, disabled, readonly, options }: WidgetProps) {
  return (
    <textarea
      id={id}
      className={`${inputBase} resize-none text-text-secondary`}
      value={value ?? ''}
      rows={(options?.rows as number | undefined) ?? 2}
      placeholder={(options?.placeholder as string | undefined) ?? placeholder}
      disabled={disabled || readonly}
      maxLength={(options?.maxLength as number | undefined) ?? 2000}
      onChange={(e) => onChange(e.target.value === '' ? options?.emptyValue : e.target.value)}
      onBlur={() => onBlur(id, value)}
      onFocus={() => onFocus(id, value)}
    />
  )
}

export function CheckboxWidget({ id, value, onChange, disabled, readonly, label }: WidgetProps) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 cursor-pointer">
      <input
        id={id}
        type="checkbox"
        className="accent-accent w-3.5 h-3.5"
        checked={!!value}
        disabled={disabled || readonly}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label && <span className="text-[11px] text-text-secondary">{label}</span>}
    </label>
  )
}

/** Overrides RJSF default `input[type=number]` (native spinners) with themed +/- stepper. */
export function UpDownWidget({
  id,
  value,
  onChange,
  onBlur,
  onFocus,
  disabled,
  readonly,
  schema,
}: WidgetProps) {
  const isInt = schema.type === 'integer'
  const min = typeof schema.minimum === 'number' ? schema.minimum : undefined
  const max = typeof schema.maximum === 'number' ? schema.maximum : undefined
  const step =
    typeof schema.multipleOf === 'number' && schema.multipleOf > 0 ? schema.multipleOf : ('any' as const)

  return (
    <NumberStepper
      id={id}
      value={value}
      onChange={(v) => onChange(v)}
      min={min}
      max={max}
      step={step}
      integer={isInt}
      disabled={disabled || readonly}
      size="sm"
      onBlur={() => onBlur(id, value)}
      onFocus={() => onFocus(id, value)}
    />
  )
}

export const WIDGETS = {
  TextWidget,
  TextareaWidget,
  CheckboxWidget,
  UpDownWidget,
} as const
