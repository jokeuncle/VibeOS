/**
 * NLP Action Registry — extensible handler system for `nlp_action` blocks.
 *
 * ## Adding a new action type
 *
 * 1. Call `registerNlpAction({ type: 'my_action', icon, execute, ... })`.
 * 2. (Optional) Add an i18n key `nlp.action.my_action` for the default chip label.
 * 3. (Optional) Supply `CardBody` for rich card rendering with editable slots.
 *
 * No other file needs to be touched — NlpActionBlock reads from this registry.
 */

import React, { useState } from 'react'
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

export interface CardBodyProps {
  payload: Record<string, unknown>
  onPayloadChange: (updated: Record<string, unknown>) => void
  t: TFn
}

export interface NlpActionDef {
  type: string
  icon: React.ReactNode
  execute(payload: Record<string, unknown>, ctx: ActionContext): Promise<ActionResult>
  /** Custom card body rendered between header and confirm button (card layout only). */
  CardBody?: React.ComponentType<CardBodyProps>
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
// Shared helpers
// ---------------------------------------------------------------------------

type RequirementDraft = { title: string; description: string }

function normalizeInitialReqs(payload: Record<string, unknown>): RequirementDraft[] {
  const raw = payload?.initial_requirements
  if (!Array.isArray(raw)) return []
  return raw.slice(0, 3).map((item) => {
    if (item && typeof item === 'object' && 'title' in item) {
      const o = item as Record<string, unknown>
      return {
        title: typeof o.title === 'string' ? o.title : '',
        description: typeof o.description === 'string' ? o.description : '',
      }
    }
    return { title: '', description: '' }
  })
}

// ---------------------------------------------------------------------------
// Built-in: workspace_create
// ---------------------------------------------------------------------------

function WorkspaceCreateCardBody({ payload, onPayloadChange, t }: CardBodyProps) {
  const [drafts, setDrafts] = useState<RequirementDraft[]>(() => normalizeInitialReqs(payload))

  function update(index: number, patch: Partial<RequirementDraft>) {
    setDrafts((prev) => {
      const next = prev.map((d, i) => (i === index ? { ...d, ...patch } : d))
      onPayloadChange({ ...payload, initial_requirements: next })
      return next
    })
  }

  if (drafts.length === 0) return null

  return (
    <div className="px-3.5 pb-2 space-y-2 border-t border-border-subtle/30 pt-2.5">
      <div className="text-[10px] font-semibold text-text-secondary uppercase tracking-wide">
        {t('nlp.homeInitialRequirements' as TranslationKey)}
      </div>
      {drafts.map((r, i) => (
        <div key={i} className="space-y-1.5 rounded-xl bg-surface-2/30 border border-border-subtle/45 p-2.5">
          <input
            type="text"
            value={r.title}
            onChange={(e) => update(i, { title: e.target.value })}
            maxLength={200}
            placeholder={t('nlp.homeRequirementTitlePh' as TranslationKey)}
            className="w-full px-2 py-1.5 rounded-lg bg-surface-1/50 border border-border-subtle text-[11px] text-text-primary placeholder:text-text-tertiary/80 outline-none focus:border-accent/35"
          />
          <textarea
            value={r.description}
            onChange={(e) => update(i, { description: e.target.value })}
            maxLength={2000}
            rows={2}
            placeholder={t('nlp.homeRequirementDescPh' as TranslationKey)}
            className="w-full px-2 py-1.5 rounded-lg bg-surface-1/50 border border-border-subtle text-[11px] text-text-secondary placeholder:text-text-tertiary/80 outline-none focus:border-accent/35 resize-none"
          />
        </div>
      ))}
    </div>
  )
}

registerNlpAction({
  type: 'workspace_create',
  icon: <Sparkles className="w-3.5 h-3.5" />,

  async execute(payload) {
    const name = (payload.suggested_name as string) || '新工作空间'
    const description = typeof payload.suggested_description === 'string' ? payload.suggested_description : ''
    const ws = await workspaceApi.create(name, description, 'indigo')
    useWorkspaceStore.setState((s) => ({ workspaces: [...s.workspaces, ws] }))
    useWorkspaceStore.getState().setActiveWorkspace(ws.id)

    const reqs = normalizeInitialReqs(payload).filter((r) => r.title.trim())
    for (const r of reqs) {
      await workspaceApi.createRequirement(ws.id, {
        title: r.title.trim(),
        description: (r.description || '').trim(),
      })
    }
    if (reqs.length > 0) await useWorkspaceStore.getState().refreshActiveWorkspace()

    useWorkspaceStore.getState().clearHomeMessages()
    useUIStore.getState().setHomeConversationVisible(false)
    return { markDone: true }
  },

  CardBody: WorkspaceCreateCardBody,

  cardHeadline(_payload, t) {
    return t('nlp.action.createWorkspace' as TranslationKey)
  },

  buildSubtitle(payload, t) {
    const name = typeof payload.suggested_name === 'string' ? payload.suggested_name : ''
    const desc = typeof payload.suggested_description === 'string' ? payload.suggested_description : ''
    const bits: string[] = []
    if (name) bits.push(`${t('nlp.homeWorkspaceNameLine' as TranslationKey)} ${name}`)
    if (desc) bits.push(desc.length > 56 ? `${desc.slice(0, 56)}…` : desc)
    const draftN = normalizeInitialReqs(payload).filter((r) => r.title.trim()).length
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
