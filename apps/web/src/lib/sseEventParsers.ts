/**
 * SSE Event Parser Registry — unified parsing for SSE content:block events into RichBlocks.
 *
 * With the unified protocol, structured blocks arrive as:
 *   event: content:block
 *   data: {"sid": "...", "blockType": "nlp_action", ...}
 *
 * ## Adding a new block type
 *
 * Call `registerBlockParser('my_block_type', (data) => ({ type: '...', ... }))`.
 *
 * For special handling (timeline, intent) use the dedicated helpers:
 * `parseTimelineStep`, `parseIntentBlock`.
 */

import type { AgentType, RichBlock, ExecutionStep, ToolInvocation } from '../types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BlockParser = (data: any) => RichBlock | null

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const BLOCK_PARSERS = new Map<string, BlockParser>()

export function registerBlockParser(blockType: string, parser: BlockParser) {
  BLOCK_PARSERS.set(blockType, parser)
}

/**
 * Parse a content:block event. The `blockType` field determines which parser to use.
 */
export function parseContentBlock(data: any): RichBlock | null {
  const blockType = data?.blockType
  if (!blockType) return null
  const parser = BLOCK_PARSERS.get(blockType)
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

export function parseToolStart(data: any): ToolInvocation {
  return {
    id: data.call_id,
    toolName: data.tool_name,
    displayName: data.display_name || data.tool_name,
    status: 'calling',
    input: data.input,
  }
}

export function parseToolResult(data: any): Partial<ToolInvocation> & { id: string } {
  return {
    id: data.call_id,
    status: data.status === 'error' ? 'error' : 'completed',
    output: data.output,
    error: data.status === 'error' ? data.output : undefined,
    durationMs: data.duration_ms,
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

export function parseAmbiguousBlock(data: any): RichBlock {
  return {
    type: 'clarification',
    clarifyPrompt: data.prompt,
    clarifyOptions: data.options?.map((o: any) => ({
      id: o.id,
      label: o.label,
      intent: o.intent,
      agentType: o.agent_type,
    })),
  }
}

// ---------------------------------------------------------------------------
// Built-in block parsers (keyed by blockType)
// ---------------------------------------------------------------------------

registerBlockParser('error_card', (data) => ({
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

registerBlockParser('cta', (data) => ({
  type: 'cta_actions',
  ctaActions: data.actions?.map((a: any) => ({
    id: a.id,
    label: a.label,
    variant: a.variant || 'secondary',
  })),
}))

registerBlockParser('nlp_action', (data) => ({
  type: 'nlp_action',
  actionType: data.action_type,
  actionPayload: data.action_payload,
  actionLabel: data.action_label,
  actionVariant: data.action_variant || 'primary',
  title: data.title,
  description: data.description,
}))

registerBlockParser('requirement_preview', (data) => ({
  type: 'requirement_preview',
  reqTitle: data.title,
  reqDescription: data.description,
  reqPriority: data.priority,
}))

registerBlockParser('warning', (data) => ({
  type: 'error_card',
  errorSeverity: 'warning',
  errorMessage: data.message,
}))
