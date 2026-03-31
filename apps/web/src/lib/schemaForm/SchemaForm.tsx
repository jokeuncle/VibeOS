/**
 * SchemaForm — thin RJSF wrapper with project-wide Tailwind theme.
 *
 * Usage:
 *   <SchemaForm
 *     schema={jsonSchema}          // standard JSON Schema object
 *     uiSchema={uiSchema}          // optional RJSF uiSchema for widget hints
 *     formData={payload}
 *     onChange={(data) => setPayload(data)}
 *   />
 *
 * All styling comes from widgets.tsx + templates.tsx; no RJSF default CSS loaded.
 */

import Form from '@rjsf/core'
import validator from '@rjsf/validator-ajv8'
import type { RJSFSchema, UiSchema } from '@rjsf/utils'
import { WIDGETS } from './widgets'
import { TEMPLATES } from './templates'

interface SchemaFormProps {
  schema: RJSFSchema
  uiSchema?: UiSchema
  formData: Record<string, unknown>
  onChange: (data: Record<string, unknown>) => void
}

export function SchemaForm({ schema, uiSchema, formData, onChange }: SchemaFormProps) {
  return (
    <Form
      schema={schema}
      uiSchema={{
        'ui:submitButtonOptions': { norender: true },
        ...uiSchema,
      }}
      formData={formData}
      validator={validator}
      widgets={WIDGETS}
      templates={TEMPLATES}
      liveValidate={false}
      onChange={({ formData: fd }) => onChange((fd ?? {}) as Record<string, unknown>)}
    />
  )
}
