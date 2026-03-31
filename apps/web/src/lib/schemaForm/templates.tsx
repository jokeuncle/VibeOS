/**
 * RJSF custom field/object/array templates styled with project Tailwind tokens.
 *
 * - FieldTemplate: wraps every leaf field (label + widget + error)
 * - ObjectFieldTemplate: renders an object's properties
 * - ArrayFieldTemplate: renders array items (e.g. initial_requirements list)
 */

import type {
  FieldTemplateProps,
  ObjectFieldTemplateProps,
  ArrayFieldTemplateProps,
} from '@rjsf/utils'

export function FieldTemplate({ id, label, required, children, rawErrors }: FieldTemplateProps) {
  const showLabel = label && label !== ' '
  return (
    <div className="space-y-1">
      {showLabel && (
        <label htmlFor={id} className="text-[10px] font-semibold text-text-secondary uppercase tracking-wide">
          {label}
          {required && <span className="text-danger ml-0.5">*</span>}
        </label>
      )}
      {children}
      {rawErrors?.length ? (
        <p className="text-[10px] text-danger">{rawErrors[0]}</p>
      ) : null}
    </div>
  )
}

export function ObjectFieldTemplate({ properties, title }: ObjectFieldTemplateProps) {
  return (
    <div className="space-y-2.5">
      {title && (
        <div className="text-[10px] font-semibold text-text-secondary uppercase tracking-wide">
          {title}
        </div>
      )}
      {properties.map((p) => (
        <div key={p.name}>{p.content}</div>
      ))}
    </div>
  )
}

export function ArrayFieldTemplate({ items, title }: ArrayFieldTemplateProps) {
  return (
    <div className="space-y-2">
      {title && (
        <div className="text-[10px] font-semibold text-text-secondary uppercase tracking-wide">
          {title}
        </div>
      )}
      {items.map((item) => (
        <div
          key={item.key}
          className="rounded-xl bg-surface-2/30 border border-border-subtle/45 p-2.5 space-y-2"
        >
          {item.children}
        </div>
      ))}
    </div>
  )
}

export const TEMPLATES = {
  FieldTemplate,
  ObjectFieldTemplate,
  ArrayFieldTemplate,
} as const
