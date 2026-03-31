/**
 * RJSF custom widgets styled with project Tailwind tokens.
 *
 * Each widget maps to a JSON Schema field type / format.
 * Pass this `widgets` object to <Form widgets={widgets} />.
 */

import type { WidgetProps } from '@rjsf/utils'

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

export const WIDGETS = {
  TextWidget,
  TextareaWidget,
  CheckboxWidget,
} as const
