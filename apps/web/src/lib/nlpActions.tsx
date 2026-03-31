/**
 * NLP Action Registry — extensible handler system for `nlp_action` blocks.
 *
 * ## Adding a new action type
 *
 * 1. Call `registerNlpAction({ type: 'my_action', icon, execute, ... })`.
 * 2. (Optional) Add an i18n key `nlp.action.my_action` for the default chip label.
 * 3. For card forms: have the backend include `form_schema` (JSON Schema) and
 *    optionally `form_ui_schema` (RJSF uiSchema) in `action_payload`.
 *    SchemaForm renders automatically — no frontend code needed per action.
 *
 * No other file needs to be touched — NlpActionBlock reads from this registry.
 */

import React from 'react'
import { Sparkles, Play, ArrowRight, ChevronRight, LayoutTemplate } from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspace'
import { useUIStore } from '../stores/ui'
import { workspaceApi } from './api'
import type { TranslationKey } from '../i18n/en'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TFn = (key: TranslationKey) => string

export interface ActionContext {
  t: TFn
  layout: 'chip' | 'card'
}

export interface ActionResult {
  /** False keeps the button active after execution. Defaults to true. */
  markDone?: boolean
}

export interface NlpActionDef {
  type: string
  icon: React.ReactNode
  execute(payload: Record<string, unknown>, ctx: ActionContext): Promise<ActionResult>
  /** Override icon in card mode (e.g. navigate shows LayoutTemplate for certain targets). */
  cardIcon?(payload: Record<string, unknown>): React.ReactNode | undefined
  /** Custom card headline — falls back to the i18n label when undefined. */
  cardHeadline?(payload: Record<string, unknown>, t: TFn): string | undefined
  /** Card subtitle line. */
  buildSubtitle?(payload: Record<string, unknown>, t: TFn): string | undefined
  /** CSS classes for the icon wrapper tint. */
  cardIconTint?(payload: Record<string, unknown>): string
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const REGISTRY = new Map<string, NlpActionDef>()

export function registerNlpAction(def: NlpActionDef) {
  REGISTRY.set(def.type, def)
}

export function getNlpAction(type: string): NlpActionDef | undefined {
  return REGISTRY.get(type)
}

export function getActionIcon(type: string): React.ReactNode {
  return REGISTRY.get(type)?.icon ?? <ArrowRight className="w-3.5 h-3.5" />
}

// ---------------------------------------------------------------------------
// Built-in: workspace_create
// Form fields come entirely from form_schema in action_payload (schema-driven).
// ---------------------------------------------------------------------------

registerNlpAction({
  type: 'workspace_create',
  icon: <Sparkles className="w-3.5 h-3.5" />,

  async execute(payload) {
    const name = (payload.suggested_name as string) || '新工作空间'
    const description = typeof payload.suggested_description === 'string' ? payload.suggested_description : ''
    const ws = await workspaceApi.create(name, description, 'indigo')
    useWorkspaceStore.setState((s) => ({ workspaces: [...s.workspaces, ws] }))
    useWorkspaceStore.getState().setActiveWorkspace(ws.id)

    const rawReqs = payload.initial_requirements
    const reqs: { title: string; description: string }[] = Array.isArray(rawReqs)
      ? rawReqs
          .filter((r): r is Record<string, unknown> => r && typeof r === 'object' && 'title' in r)
          .map((r) => ({ title: String(r.title ?? ''), description: String(r.description ?? '') }))
          .filter((r) => r.title.trim())
      : []

    for (const r of reqs) {
      await workspaceApi.createRequirement(ws.id, {
        title: r.title.trim(),
        description: r.description.trim(),
      })
    }
    if (reqs.length > 0) await useWorkspaceStore.getState().refreshWorkspaceDocument()

    useWorkspaceStore.getState().clearHomeMessages()
    useUIStore.getState().setConversationVisible('home', false)
    return { markDone: true }
  },

  cardHeadline(_payload, t) {
    return t('nlp.action.createWorkspace' as TranslationKey)
  },

  buildSubtitle(payload, t) {
    const name = typeof payload.suggested_name === 'string' ? payload.suggested_name : ''
    const desc = typeof payload.suggested_description === 'string' ? payload.suggested_description : ''
    const bits: string[] = []
    if (name) bits.push(`${t('nlp.homeWorkspaceNameLine' as TranslationKey)} ${name}`)
    if (desc) bits.push(desc.length > 56 ? `${desc.slice(0, 56)}…` : desc)
    const reqs = Array.isArray(payload.initial_requirements) ? payload.initial_requirements : []
    const draftN = reqs.filter((r: unknown) => r && typeof r === 'object' && 'title' in (r as object) && String((r as Record<string, unknown>).title ?? '').trim()).length
    if (draftN > 0) {
      bits.push(t('nlp.homeDraftRequirementsCount' as TranslationKey).replace(/\{count\}/g, String(draftN)))
    }
    return bits.length > 0 ? bits.join(' · ') : t('nlp.homeWorkspaceCreateHint' as TranslationKey)
  },

  cardIconTint() {
    return 'bg-accent/12 text-accent'
  },
})

// ---------------------------------------------------------------------------
// Built-in: task_execute
// ---------------------------------------------------------------------------

registerNlpAction({
  type: 'task_execute',
  icon: <Play className="w-3.5 h-3.5" />,

  async execute(payload) {
    const taskId = payload.taskId as string
    if (!taskId) return { markDone: true }
    const wsId = useWorkspaceStore.getState().activeWorkspaceId
    if (wsId) useWorkspaceStore.getState().sendNLPMessageStream(`execute task ${taskId}`)
    else useWorkspaceStore.getState().sendHomeNLPStream(`execute task ${taskId}`)
    return { markDone: true }
  },
})

// ---------------------------------------------------------------------------
// Built-in: phase_execute
// ---------------------------------------------------------------------------

registerNlpAction({
  type: 'phase_execute',
  icon: <ArrowRight className="w-3.5 h-3.5" />,

  async execute(payload, { t }) {
    const phase = payload.phase as string
    if (!phase) return { markDone: true }
    const wsId = useWorkspaceStore.getState().activeWorkspaceId
    if (wsId) {
      useWorkspaceStore.getState().runPhase(phase)
    } else {
      useUIStore.getState().addToast({
        type: 'info',
        message: t('workspace.selectFirst' as TranslationKey),
      })
    }
    return { markDone: true }
  },
})

// ---------------------------------------------------------------------------
// Built-in: navigate
// ---------------------------------------------------------------------------

registerNlpAction({
  type: 'navigate',
  icon: <ChevronRight className="w-3.5 h-3.5" />,

  async execute(payload, { t }) {
    const target = payload.target as string | undefined
    const ui = useUIStore.getState()
    const ws = useWorkspaceStore.getState()
    const wsId = ws.activeWorkspaceId

    if (target === 'create_workspace') {
      ui.setTemplatePickerOpen(true)
      return { markDone: false }
    }

    if (!wsId) {
      ui.addToast({ type: 'info', message: t('workspace.selectFirst' as TranslationKey) })
      return { markDone: true }
    }

    if (target === 'requirement_detail') {
      const rid = (payload.requirementId as string | undefined) || ws.activeRequirementId
      if (rid) ws.setActiveRequirement(rid)
      ui.setViewMode('requirements')
    } else if (target === 'task_list') {
      ws.setActiveRequirement(null)
      ui.setViewMode('requirements')
    }
    return { markDone: true }
  },

  cardIcon(payload) {
    if (payload.target === 'create_workspace') return <LayoutTemplate className="w-4 h-4" />
    return undefined
  },

  buildSubtitle(payload, t) {
    if (payload.target === 'create_workspace') {
      return t('nlp.homeNavigateCreateHint' as TranslationKey)
    }
    return undefined
  },
})

// ---------------------------------------------------------------------------
// Built-in: confirm
// ---------------------------------------------------------------------------

registerNlpAction({
  type: 'confirm',
  icon: <ArrowRight className="w-3.5 h-3.5" />,

  async execute(payload) {
    const text =
      (payload.message as string) ||
      (payload.followUp as string) ||
      (payload.prompt as string) ||
      '请继续'
    const wsId = useWorkspaceStore.getState().activeWorkspaceId
    if (wsId) useWorkspaceStore.getState().sendNLPMessageStream(text)
    else useWorkspaceStore.getState().sendHomeNLPStream(text)
    return { markDone: true }
  },
})
