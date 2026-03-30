/**
 * SSE Event Parser Registry — unified parsing for SSE events into RichBlocks.
 *
 * ## Adding a new SSE event type
 *
 * 1. Call `registerSseBlockParser('my_event', (data) => ({ type: '...', ... }))`.
 * 2. Both workspace and home streams will automatically pick it up via `parseSseToBlock`.
 *
 * For special handling (timeline upsert, intent feedback, etc.) use the
 * dedicated helpers: `parseTimelineStep`, `parseIntentBlock`.
 */

import type { AgentType, RichBlock, ExecutionStep } from '../types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SseBlockParser = (data: any) => RichBlock | null

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const BLOCK_PARSERS = new Map<string, SseBlockParser>()

export function registerSseBlockParser(eventName: string, parser: SseBlockParser) {
  BLOCK_PARSERS.set(eventName, parser)
}

export function parseSseToBlock(eventName: string | undefined, data: any): RichBlock | null {
  if (!eventName) return null
  const parser = BLOCK_PARSERS.get(eventName)
  return parser ? parser(data) : null
}

// ---------------------------------------------------------------------------
// Dedicated helpers for special events
// ---------------------------------------------------------------------------

export function parseTimelineStep(data: any): ExecutionStep {
  return {
    id: data.step_id,
    label: data.label,
    status: data.status,
    detail: data.detail,
  }
}

export function parseIntentBlock(data: any): { block: RichBlock; agentType: AgentType } {
  return {
    block: {
      type: 'intent_feedback',
      intentLabel: data.intent_label?.zh || data.intent,
      intentId: data.intent,
      agentLabel: data.agent_label?.zh || data.target_agent,
      agentId: data.target_agent,
      confidence: data.confidence,
      ...(data.slots && Object.keys(data.slots).length > 0
        ? { nluSlots: data.slots as Record<string, unknown> }
        : {}),
    },
    agentType: data.target_agent as AgentType,
  }
}

// ---------------------------------------------------------------------------
// Built-in parsers
// ---------------------------------------------------------------------------

registerSseBlockParser('clarification', (data) => ({
  type: 'clarification',
  clarifyPrompt: data.prompt,
  clarifyOptions: data.options?.map((o: any) => ({
    id: o.id,
    label: o.label,
    intent: o.intent,
    agentType: o.agent_type,
  })),
}))

registerSseBlockParser('error_card', (data) => ({
  type: 'error_card',
  errorSeverity: data.error_type,
  errorMessage: data.message,
  errorHints: data.hints,
  errorActions: data.actions?.map((a: any) => ({
    id: a.id,
    label: a.label,
    variant: a.variant || 'secondary',
  })),
}))

registerSseBlockParser('cta', (data) => ({
  type: 'cta_actions',
  ctaActions: data.actions?.map((a: any) => ({
    id: a.id,
    label: a.label,
    variant: a.variant || 'secondary',
  })),
}))

registerSseBlockParser('nlp_action', (data) => ({
  type: 'nlp_action',
  actionType: data.action_type,
  actionPayload: data.action_payload,
  actionLabel: data.action_label,
  actionVariant: data.action_variant || 'primary',
  title: data.title,
  description: data.description,
}))

registerSseBlockParser('requirement_preview', (data) => ({
  type: 'requirement_preview',
  reqTitle: data.title,
  reqDescription: data.description,
  reqPriority: data.priority,
}))
