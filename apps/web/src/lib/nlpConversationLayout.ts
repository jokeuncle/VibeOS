import type { RichBlock } from '../types'

/** Shown inside collapsible CoT panel instead of inline with the reply. */
export const NLP_CONVERSATION_REASONING_TYPES = new Set<RichBlock['type']>(['intent_feedback', 'execution_timeline'])

export const NLP_CONVERSATION_CARD_TYPES = new Set<RichBlock['type']>([
  'nlp_action',
  'task_card',
  'action_card',
  'cta_actions',
  'requirement_preview',
  'execution_result',
])

/** Hide plain text bubble when it only repeats an adjacent error_card body (same string). */
export function shouldShowAgentTextBubble(
  content: string | undefined,
  richBlocks: RichBlock[] | undefined,
): boolean {
  const text = (content || '').trim()
  if (!text) return false
  if (!richBlocks?.length) return true
  const dup = richBlocks.some(
    (b) => b.type === 'error_card' && (b.errorMessage || '').trim() === text,
  )
  return !dup
}

export function partitionNlpConversationRichBlocks(blocks: RichBlock[] | undefined) {
  if (!blocks?.length) {
    return {
      reasoningTimeline: undefined as RichBlock | undefined,
      reasoningIntent: undefined as RichBlock | undefined,
      inlineBlocks: [] as RichBlock[],
      cardBlocks: [] as RichBlock[],
    }
  }
  const reasoningTimeline = blocks.find((b) => b.type === 'execution_timeline')
  const reasoningIntent = blocks.find((b) => b.type === 'intent_feedback')
  const visible = blocks.filter((b) => !NLP_CONVERSATION_REASONING_TYPES.has(b.type))
  const cardBlocks = visible.filter((b) => NLP_CONVERSATION_CARD_TYPES.has(b.type))
  const inlineBlocks = visible.filter((b) => !NLP_CONVERSATION_CARD_TYPES.has(b.type))
  return { reasoningTimeline, reasoningIntent, inlineBlocks, cardBlocks }
}
