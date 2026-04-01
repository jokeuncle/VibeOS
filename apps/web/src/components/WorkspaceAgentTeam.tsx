import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  Bot, Settings2, ChevronDown, ChevronUp,
  Cpu, Wrench, MessageSquare, ToggleLeft, ToggleRight,
  Sparkles, Code2, TestTube, Rocket, Eye, Brush, ClipboardList,
  ShieldCheck, ShieldAlert, Shield, Plus, Trash2,
  CheckSquare, GitBranch, Workflow, SlidersHorizontal,
} from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspace'
import { useUIStore } from '../stores/ui'
import { workspaceApi, trustApi, modelsApi, workspaceGraphApi } from '../lib/api'
import type { Agent } from '../types'
import type { TrustScore, LlmModel, WorkspaceGraph } from '../lib/api'
import { useT } from '../i18n'
import type { TranslationKey } from '../i18n/en'
import type { AgentStatus } from '../types'
import { useRegisterNlpContext } from '../hooks/useNlpContext'
import type { NlpContextDescriptor } from '../lib/nlpContext'
import FormSelect from './ui/FormSelect'

interface AgentMeta {
  type: string
  nameKey: TranslationKey
  descKey: TranslationKey
  promptHintKey: TranslationKey
  icon: typeof Bot
  iconColor: string
}

const AGENT_META: AgentMeta[] = [
  { type: 'pm', nameKey: 'agentTeam.agent.pm.name' as TranslationKey, descKey: 'agentTeam.agent.pm.desc', promptHintKey: 'agentTeam.agent.pm.promptHint', icon: Sparkles, iconColor: 'text-violet-400' },
  { type: 'requirement', nameKey: 'agentTeam.agent.requirement.name' as TranslationKey, descKey: 'agentTeam.agent.requirement.desc', promptHintKey: 'agentTeam.agent.requirement.promptHint', icon: ClipboardList, iconColor: 'text-blue-400' },
  { type: 'architecture', nameKey: 'agentTeam.agent.architecture.name' as TranslationKey, descKey: 'agentTeam.agent.architecture.desc', promptHintKey: 'agentTeam.agent.architecture.promptHint', icon: Cpu, iconColor: 'text-indigo-400' },
  { type: 'design', nameKey: 'agentTeam.agent.design.name' as TranslationKey, descKey: 'agentTeam.agent.design.desc', promptHintKey: 'agentTeam.agent.design.promptHint', icon: Brush, iconColor: 'text-pink-400' },
  { type: 'development', nameKey: 'agentTeam.agent.development.name' as TranslationKey, descKey: 'agentTeam.agent.development.desc', promptHintKey: 'agentTeam.agent.development.promptHint', icon: Code2, iconColor: 'text-emerald-400' },
  { type: 'testing', nameKey: 'agentTeam.agent.testing.name' as TranslationKey, descKey: 'agentTeam.agent.testing.desc', promptHintKey: 'agentTeam.agent.testing.promptHint', icon: TestTube, iconColor: 'text-yellow-400' },
  { type: 'cicd', nameKey: 'agentTeam.agent.cicd.name' as TranslationKey, descKey: 'agentTeam.agent.cicd.desc', promptHintKey: 'agentTeam.agent.cicd.promptHint', icon: Rocket, iconColor: 'text-orange-400' },
  { type: 'monitoring', nameKey: 'agentTeam.agent.monitoring.name' as TranslationKey, descKey: 'agentTeam.agent.monitoring.desc', promptHintKey: 'agentTeam.agent.monitoring.promptHint', icon: Eye, iconColor: 'text-cyan-400' },
]

const STATUS_KEY: Record<AgentStatus, string> = {
  idle: 'agent.status.idle',
  running: 'agent.status.running',
  waiting: 'agent.status.waiting',
  error: 'agent.status.error',
}

function statusDot(status: AgentStatus) {
  const map: Record<AgentStatus, string> = {
    running: 'bg-accent animate-pulse',
    waiting: 'bg-warning',
    error: 'bg-danger',
    idle: 'bg-surface-4',
  }
  return map[status] ?? 'bg-surface-4'
}

function autonomyIcon(level: string) {
  if (level === 'autonomous') return ShieldCheck
  if (level === 'semi_autonomous') return ShieldAlert
  return Shield
}

function autonomyColor(level: string) {
  if (level === 'autonomous') return 'text-success'
  if (level === 'semi_autonomous') return 'text-warning'
  return 'text-text-tertiary'
}

const inputClass = 'w-full rounded-lg bg-surface-2/40 border border-border-subtle px-3 py-2 text-[11px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent/35 focus:border-accent/30'
const labelClass = 'flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary mb-2'

function AgentRow({
  meta, live, wsId, trust, models, graphs, onRefresh,
}: {
  meta: AgentMeta
  live?: Agent
  wsId: string
  trust?: TrustScore
  models: LlmModel[]
  graphs: WorkspaceGraph[]
  onRefresh: () => Promise<void>
}) {
  const t = useT()
  const addToast = useUIStore(s => s.addToast)
  const setViewMode = useUIStore(s => s.setViewMode)
  const [expanded, setExpanded] = useState(false)
  const liveStatus: AgentStatus = live?.status ?? 'idle'
  const agentId = live?.id
  const [model, setModel] = useState(live?.preferredModel ?? '')
  const [promptDraft, setPromptDraft] = useState(live?.systemPromptTemplate ?? '')
  const [enabledTools, setEnabledTools] = useState<Set<string>>(new Set())
  const [capsDraft, setCapsDraft] = useState('{}')
  const [phaseEnabled, setPhaseEnabled] = useState(live?.enabled ?? true)
  const [requireApproval, setRequireApproval] = useState(live?.requireApproval ?? false)
  const [qualityGate, setQualityGate] = useState(live?.qualityGate ?? '')
  const [graphId, setGraphId] = useState(live?.graphId ?? '')
  const [trustThreshold, setTrustThreshold] = useState(live?.trustThreshold ?? 50)
  const [saving, setSaving] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const Icon = meta.icon
  const isActive = liveStatus !== 'idle'

  useEffect(() => {
    if (live?.preferredModel) setModel(live.preferredModel)
  }, [live?.preferredModel])

  useEffect(() => {
    if (!agentId) setExpanded(false)
  }, [agentId])

  useEffect(() => {
    setPromptDraft(live?.systemPromptTemplate ?? '')
    const tools = live?.toolManifest && live.toolManifest.length > 0 ? live.toolManifest : []
    setEnabledTools(new Set(tools))
    const c = live?.capabilities
    setCapsDraft(c && Object.keys(c).length > 0 ? JSON.stringify(c, null, 2) : '{}')
    setPhaseEnabled(live?.enabled ?? true)
    setRequireApproval(live?.requireApproval ?? false)
    setQualityGate(live?.qualityGate ?? '')
    setGraphId(live?.graphId ?? '')
    setTrustThreshold(live?.trustThreshold ?? 50)
  }, [live?.id, live?.systemPromptTemplate, live?.toolManifest, live?.capabilities, live?.enabled, live?.requireApproval, live?.qualityGate, live?.graphId, live?.trustThreshold])

  const modelSelectOptions = useMemo(
    () => models.map(m => ({ value: m.name, label: `${m.provider} / ${m.name}` })),
    [models],
  )
  const graphSelectOptions = useMemo(
    () => [
      { value: '', label: t('agentTeam.field.graphNone' as TranslationKey) },
      ...graphs.map(g => ({ value: g.id, label: g.name })),
    ],
    [graphs, t],
  )
  const allToolNames = useMemo(() => [...new Set(live?.toolManifest ?? [])], [live?.toolManifest])

  async function handleModelChange(v: string) {
    setModel(v)
    if (!agentId) return
    await workspaceApi.updateAgent(wsId, agentId, { preferredModel: v }).catch(() => {})
    await onRefresh()
  }
  async function handleAddAgent() {
    setSaving(true)
    try { await workspaceApi.createAgent(wsId, { type: meta.type }); await onRefresh() }
    catch { addToast({ type: 'error', message: t('agentTeam.error.saveFailed' as TranslationKey) }) }
    finally { setSaving(false) }
  }
  async function handleRemoveAgent() {
    if (!agentId || !window.confirm(t('agentTeam.confirmDelete' as TranslationKey))) return
    setSaving(true)
    try { await workspaceApi.deleteAgent(wsId, agentId); await onRefresh() }
    catch { addToast({ type: 'error', message: t('agentTeam.error.saveFailed' as TranslationKey) }) }
    finally { setSaving(false) }
  }
  function toggleTool(name: string) {
    setEnabledTools(prev => { const n = new Set(prev); if (n.has(name)) n.delete(name); else n.add(name); return n })
  }
  async function handlePhaseEnabledToggle() {
    if (!agentId) return
    const next = !phaseEnabled; setPhaseEnabled(next)
    await workspaceApi.updateAgent(wsId, agentId, { enabled: next }).catch(() => {}); await onRefresh()
  }
  async function handleApprovalToggle() {
    if (!agentId) return
    const next = !requireApproval; setRequireApproval(next)
    await workspaceApi.updateAgent(wsId, agentId, { requireApproval: next }).catch(() => {}); await onRefresh()
  }
  async function handleGraphChange(v: string) {
    setGraphId(v); if (!agentId) return
    await workspaceApi.updateAgent(wsId, agentId, { graphId: v || null }).catch(() => {}); await onRefresh()
  }
  async function handleTrustThresholdChange(v: number) {
    setTrustThreshold(v); if (!agentId) return
    await workspaceApi.updateAgent(wsId, agentId, { trustThreshold: v }).catch(() => {}); await onRefresh()
  }
  async function handleSaveConfig() {
    if (!agentId) return
    let caps: Record<string, unknown>
    try {
      const parsed = JSON.parse(capsDraft.trim() || '{}') as unknown
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('bad')
      caps = parsed as Record<string, unknown>
    } catch { addToast({ type: 'error', message: t('agentTeam.error.invalidCapabilities' as TranslationKey) }); return }
    setSaving(true)
    try {
      await workspaceApi.updateAgent(wsId, agentId, { systemPromptTemplate: promptDraft, toolManifest: [...enabledTools], capabilities: caps, qualityGate: qualityGate || null })
      await onRefresh()
    } catch { addToast({ type: 'error', message: t('agentTeam.error.saveFailed' as TranslationKey) }) }
    finally { setSaving(false) }
  }

  const hasCaps = capsDraft.trim() !== '' && capsDraft.trim() !== '{}'

  return (
    <div>
      {/* Row — hover-only, no per-row border (ui-chrome list row pattern) */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => agentId && setExpanded(v => !v)}
        onKeyDown={e => { if (e.key === 'Enter' && agentId) setExpanded(v => !v) }}
        className={`flex items-center gap-2.5 rounded-lg -mx-1 px-3 py-2.5 transition-colors cursor-pointer ${
          expanded ? 'bg-surface-2/50' : 'hover:bg-surface-2/35'
        }`}
      >
        {/* Left icon rail (ui-chrome: w-7 h-7 rounded-lg) */}
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
          isActive ? 'bg-accent/10' : 'bg-surface-3'
        }`}>
          <Icon className={`w-3.5 h-3.5 ${isActive ? meta.iconColor : 'text-text-tertiary'}`} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-[11px] font-semibold ${agentId ? 'text-text-secondary' : 'text-text-tertiary'}`}>
              {t(meta.nameKey)}
            </span>
            {model && (
              <span className="text-[9px] font-mono text-text-tertiary bg-surface-3 px-1.5 py-0.5 rounded hidden sm:inline">
                {model}
              </span>
            )}
            {!phaseEnabled && agentId && (
              <span className="text-[9px] font-medium text-text-tertiary bg-surface-3 px-1.5 py-0.5 rounded uppercase">
                {t('agentTeam.phaseDisabled' as TranslationKey)}
              </span>
            )}
          </div>
          <p className="text-[10px] text-text-tertiary truncate">{t(meta.descKey)}</p>
        </div>

        {/* Status indicator (real-time via WebSocket) */}
        {agentId && (
          <div className="flex items-center gap-1 shrink-0">
            <div className={`w-1.5 h-1.5 rounded-full ${statusDot(liveStatus)}`} />
            <span className="text-[10px] text-text-tertiary">{t(STATUS_KEY[liveStatus] as TranslationKey)}</span>
          </div>
        )}

        {/* Actions */}
        <div className="shrink-0">
          {!agentId ? (
            <button type="button" onClick={e => { e.stopPropagation(); handleAddAgent() }} disabled={saving}
              className="flex items-center gap-1 rounded-md border border-border-subtle bg-surface-2/40 px-2 py-1 text-[10px] font-medium text-text-secondary hover:bg-surface-2/55 disabled:opacity-50 cursor-pointer">
              <Plus className="w-3 h-3" />{t('agentTeam.addAgent' as TranslationKey)}
            </button>
          ) : (
            <div className="w-5 h-5 flex items-center justify-center text-text-tertiary">
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </div>
          )}
        </div>
      </div>

      {/* Expanded config panel */}
      {agentId && (
        <div className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`} inert={!expanded ? true : undefined}>
          <div className="min-h-0 overflow-hidden">
            <div className="ml-9 mr-1 mb-2 mt-1 rounded-lg bg-surface-2/25 border border-border-subtle p-4 space-y-4">

              {/* Model */}
              <div>
                <label className={labelClass}><Cpu className="w-3 h-3" />{t('agentTeam.field.model')}</label>
                <FormSelect size="sm" fullWidth value={model} options={modelSelectOptions} onChange={handleModelChange} />
              </div>

              {/* Execution config */}
              <div>
                <label className={labelClass}><Workflow className="w-3 h-3" />{t('agentTeam.field.execution' as TranslationKey)}</label>
                <div className="space-y-3">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <button type="button" onClick={handlePhaseEnabledToggle} className="cursor-pointer" aria-label="toggle phase">
                      {phaseEnabled ? <ToggleRight className="w-5 h-5 text-accent" /> : <ToggleLeft className="w-5 h-5 text-text-tertiary" />}
                    </button>
                    <div>
                      <div className="text-[11px] font-medium text-text-secondary">{t('agentTeam.field.enabled' as TranslationKey)}</div>
                      <div className="text-[10px] text-text-tertiary">{t('agentTeam.field.enabledHint' as TranslationKey)}</div>
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <button type="button" onClick={handleApprovalToggle} className="cursor-pointer" aria-label="toggle approval">
                      {requireApproval ? <ToggleRight className="w-5 h-5 text-accent" /> : <ToggleLeft className="w-5 h-5 text-text-tertiary" />}
                    </button>
                    <div>
                      <div className="text-[11px] font-medium text-text-secondary">{t('agentTeam.field.requireApproval' as TranslationKey)}</div>
                      <div className="text-[10px] text-text-tertiary">{t('agentTeam.field.requireApprovalHint' as TranslationKey)}</div>
                    </div>
                  </label>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-[10px] font-medium text-text-tertiary">{t('agentTeam.field.trustThreshold' as TranslationKey)}</div>
                      <span className="text-[10px] font-mono text-text-tertiary tabular-nums">{trustThreshold.toFixed(0)}</span>
                    </div>
                    <div className="text-[10px] text-text-tertiary mb-2">{t('agentTeam.field.trustThresholdHint' as TranslationKey)}</div>
                    <input type="range" min={0} max={100} step={5} value={trustThreshold}
                      onChange={e => setTrustThreshold(Number(e.target.value))}
                      onMouseUp={e => handleTrustThresholdChange(Number((e.target as HTMLInputElement).value))}
                      onTouchEnd={e => handleTrustThresholdChange(Number((e.target as HTMLInputElement).value))}
                      className="w-full h-1 bg-surface-3 rounded-full appearance-none cursor-pointer accent-accent [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:appearance-none"
                    />
                  </div>

                  <div>
                    <div className="text-[10px] font-medium text-text-tertiary mb-1">{t('agentTeam.field.qualityGate' as TranslationKey)}</div>
                    <input type="text" value={qualityGate} onChange={e => setQualityGate(e.target.value)} placeholder={t('agentTeam.field.qualityGatePlaceholder' as TranslationKey)} className={inputClass} />
                  </div>

                  <div>
                    <div className="text-[10px] font-medium text-text-tertiary mb-1">{t('agentTeam.field.graph' as TranslationKey)}</div>
                    <div className="flex gap-2">
                      <div className="flex-1"><FormSelect size="sm" fullWidth value={graphId} options={graphSelectOptions} onChange={handleGraphChange} /></div>
                      <button type="button" onClick={() => setViewMode('pipeline')} className="rounded-md border border-border-subtle bg-surface-2/40 px-2.5 py-1.5 text-[10px] font-medium text-text-secondary hover:bg-surface-2/55 cursor-pointer flex items-center gap-1">
                        <GitBranch className="w-3 h-3" />{t('agentTeam.field.editGraph' as TranslationKey)}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tools */}
              <div>
                <label className={labelClass}><Wrench className="w-3 h-3" />{t('agentTeam.field.tools')}</label>
                {allToolNames.length > 0 ? (
                  <div className="space-y-1.5">
                    {allToolNames.map(name => (
                      <label key={name} className="flex items-center gap-2 cursor-pointer">
                        <CheckSquare className={`w-3.5 h-3.5 ${enabledTools.has(name) ? 'text-accent' : 'text-surface-4'}`} onClick={() => toggleTool(name)} />
                        <span className="text-[11px] font-mono text-text-primary">{name}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-text-tertiary italic">{t('agentTeam.field.toolsHint' as TranslationKey)}</p>
                )}
              </div>

              {/* System prompt */}
              <div>
                <label className={labelClass}><MessageSquare className="w-3 h-3" />{t('agentTeam.field.systemPrompt')}</label>
                <p className="text-[11px] text-text-tertiary italic mb-2">{t('agentTeam.field.systemPromptHint')}</p>
                <textarea value={promptDraft} onChange={e => setPromptDraft(e.target.value)} rows={4} className={`${inputClass} font-mono resize-y min-h-[4.5rem]`} spellCheck={false} />
              </div>

              {/* Advanced */}
              <div className="rounded-lg border border-border-subtle overflow-hidden">
                <button type="button" onClick={() => setAdvancedOpen(v => !v)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary hover:bg-surface-2/30 cursor-pointer transition-colors">
                  <SlidersHorizontal className="w-3 h-3" />{t('agentTeam.field.advanced' as TranslationKey)}
                  {hasCaps && <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />}
                  <ChevronDown className={`w-3 h-3 ml-auto transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
                </button>
                {advancedOpen && (
                  <div className="px-3 pb-3 pt-1 border-t border-border-subtle">
                    <label className={labelClass}>{t('agentTeam.field.capabilities' as TranslationKey)}</label>
                    <p className="text-[10px] text-text-tertiary mb-2">{t('agentTeam.field.capabilitiesHint' as TranslationKey)}</p>
                    <textarea value={capsDraft} onChange={e => setCapsDraft(e.target.value)} rows={3} className={`${inputClass} font-mono resize-y min-h-[3rem]`} spellCheck={false} />
                  </div>
                )}
              </div>

              {/* Save */}
              <div className="flex justify-end pt-1">
                <button type="button" onClick={handleSaveConfig} disabled={saving} className="rounded-md bg-accent text-white text-[11px] font-medium px-3 py-1.5 hover:opacity-90 disabled:opacity-50 cursor-pointer">
                  {saving ? t('agentTeam.saving' as TranslationKey) : t('agentTeam.save' as TranslationKey)}
                </button>
              </div>

              {/* Trust & Autonomy */}
              {trust && trust.total_calls > 0 && (() => {
                const AIcon = autonomyIcon(trust.autonomy)
                const aKey = trust.autonomy === 'autonomous' ? 'agentTeam.trust.autonomous' : trust.autonomy === 'semi_autonomous' ? 'agentTeam.trust.semiAutonomous' : 'agentTeam.trust.supervised'
                return (
                  <div>
                    <label className={labelClass}>
                      <AIcon className={`w-3 h-3 ${autonomyColor(trust.autonomy)}`} />{t('agentTeam.trust.title' as TranslationKey)}
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-lg bg-surface-2/40 border border-border-subtle p-2.5">
                        <div className="text-[10px] text-text-tertiary mb-1">{t('agentTeam.trust.score' as TranslationKey)}</div>
                        <div className="text-sm font-semibold text-text-primary tabular-nums">{trust.score.toFixed(1)}</div>
                        <div className="mt-1 h-1 bg-surface-3 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(trust.score, 100)}%` }} />
                        </div>
                      </div>
                      <div className="rounded-lg bg-surface-2/40 border border-border-subtle p-2.5">
                        <div className="text-[10px] text-text-tertiary mb-1">{t('agentTeam.trust.autonomy' as TranslationKey)}</div>
                        <div className={`text-[11px] font-semibold ${autonomyColor(trust.autonomy)}`}>{t(aKey as TranslationKey)}</div>
                      </div>
                      <div className="rounded-lg bg-surface-2/40 border border-border-subtle p-2.5">
                        <div className="text-[10px] text-text-tertiary mb-1">{t('agentTeam.trust.calls' as TranslationKey)}</div>
                        <div className="text-sm font-semibold text-text-primary tabular-nums">{trust.total_calls}</div>
                      </div>
                    </div>
                  </div>
                )
              })()}

              {/* Danger zone: remove */}
              <div className="border-t border-border-subtle pt-3 mt-2">
                <button type="button" onClick={handleRemoveAgent} disabled={saving}
                  className="flex items-center gap-1.5 rounded-md border border-danger/20 bg-danger/5 px-2.5 py-1.5 text-[10px] font-medium text-danger hover:bg-danger/10 disabled:opacity-40 cursor-pointer transition-colors">
                  <Trash2 className="w-3 h-3" />{t('agentTeam.removeAgent' as TranslationKey)}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function WorkspaceAgentTeam() {
  const t = useT()
  const { workspaces, activeWorkspaceId, refreshWorkspaceDocument } = useWorkspaceStore()
  const workspace = workspaces.find(w => w.id === activeWorkspaceId)
  const liveAgents = workspace?.agents ?? []
  const onRefresh = useCallback(async () => { await refreshWorkspaceDocument() }, [refreshWorkspaceDocument])

  const [trustScores, setTrustScores] = useState<TrustScore[]>([])
  const [availableModels, setAvailableModels] = useState<LlmModel[]>([])
  const [graphs, setGraphs] = useState<WorkspaceGraph[]>([])

  useEffect(() => {
    trustApi.list().then(setTrustScores).catch(() => {})
    modelsApi.list().then(setAvailableModels).catch(() => {})
  }, [])

  useEffect(() => {
    if (activeWorkspaceId) workspaceGraphApi.list(activeWorkspaceId).then(setGraphs).catch(() => {})
  }, [activeWorkspaceId])

  const activeCount = liveAgents.filter(a => a.status !== 'idle').length

  const nlpDesc: NlpContextDescriptor | null = activeWorkspaceId ? {
    id: 'view:agent_team', type: 'agent_team', priority: 15,
    label: t('sidebar.agentTeam' as TranslationKey), agentType: 'pm',
    agentLabel: t('agent.name.pm'), contextPayload: { view: 'agent_team' },
    placeholderKey: 'command.placeholderNLP', intentHints: ['query_progress'],
  } : null
  useRegisterNlpContext(nlpDesc)

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-6">
      {/* Page header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Bot className="w-4 h-4 text-accent" />
          <h1 className="text-base font-semibold text-text-primary tracking-tight">{t('agentTeam.title')}</h1>
          <span className="ml-auto text-[11px] font-mono text-text-tertiary tabular-nums">
            {activeCount}/{AGENT_META.length} {t('agentTeam.active')}
          </span>
        </div>
        <p className="text-[12px] text-text-tertiary">{t('agentTeam.desc')}</p>
      </div>

      {/* Single outer panel — agents as list rows inside */}
      <div className="rounded-xl border border-border-subtle bg-surface-1/30 overflow-hidden">
        <div className="px-4 py-3 border-b border-border-subtle flex items-center gap-2">
          <Settings2 className="w-3.5 h-3.5 text-text-tertiary" />
          <span className="text-xs font-medium text-text-secondary">{t('agentTeam.roster')}</span>
          <span className="ml-auto text-[10px] font-mono text-text-tertiary tabular-nums">
            {liveAgents.length} {t('agentTeam.configured' as TranslationKey)}
          </span>
        </div>

        <div className="p-2">
          {AGENT_META.map(meta => {
            const live = liveAgents.find(a => a.type === meta.type)
            const agentModel = live?.preferredModel ?? ''
            const trust = trustScores.find(s => s.agent_type === meta.type && s.model === agentModel)
              ?? trustScores.find(s => s.agent_type === meta.type)
            return (
              <AgentRow key={meta.type} meta={meta} live={live} wsId={activeWorkspaceId ?? ''} trust={trust} models={availableModels} graphs={graphs} onRefresh={onRefresh} />
            )
          })}
        </div>
      </div>
    </motion.div>
  )
}
