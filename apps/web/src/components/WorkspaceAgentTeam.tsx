import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  Bot, Settings2, ChevronDown, ChevronUp,
  Cpu, Wrench, MessageSquare, ToggleLeft, ToggleRight,
  Sparkles, Code2, TestTube, Rocket, Eye, Brush, ClipboardList,
  ShieldCheck, ShieldAlert, Shield, Plus, Trash2,
  CheckSquare, GitBranch, Workflow,
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
  label: string
  descKey: TranslationKey
  promptHintKey: TranslationKey
  icon: typeof Bot
  iconColor: string
  ringColor: string
}

const AGENT_META: AgentMeta[] = [
  { type: 'pm', label: 'PM Agent', descKey: 'agentTeam.agent.pm.desc', promptHintKey: 'agentTeam.agent.pm.promptHint', icon: Sparkles, iconColor: 'text-violet-400', ringColor: 'border-violet-500/30 bg-violet-500/6' },
  { type: 'requirement', label: 'Requirement Agent', descKey: 'agentTeam.agent.requirement.desc', promptHintKey: 'agentTeam.agent.requirement.promptHint', icon: ClipboardList, iconColor: 'text-blue-400', ringColor: 'border-blue-500/30 bg-blue-500/6' },
  { type: 'architecture', label: 'Architecture Agent', descKey: 'agentTeam.agent.architecture.desc', promptHintKey: 'agentTeam.agent.architecture.promptHint', icon: Cpu, iconColor: 'text-indigo-400', ringColor: 'border-indigo-500/30 bg-indigo-500/6' },
  { type: 'design', label: 'Design Agent', descKey: 'agentTeam.agent.design.desc', promptHintKey: 'agentTeam.agent.design.promptHint', icon: Brush, iconColor: 'text-pink-400', ringColor: 'border-pink-500/30 bg-pink-500/6' },
  { type: 'development', label: 'Dev Agent', descKey: 'agentTeam.agent.development.desc', promptHintKey: 'agentTeam.agent.development.promptHint', icon: Code2, iconColor: 'text-emerald-400', ringColor: 'border-emerald-500/30 bg-emerald-500/6' },
  { type: 'testing', label: 'Test Agent', descKey: 'agentTeam.agent.testing.desc', promptHintKey: 'agentTeam.agent.testing.promptHint', icon: TestTube, iconColor: 'text-yellow-400', ringColor: 'border-yellow-500/30 bg-yellow-500/6' },
  { type: 'cicd', label: 'CI/CD Agent', descKey: 'agentTeam.agent.cicd.desc', promptHintKey: 'agentTeam.agent.cicd.promptHint', icon: Rocket, iconColor: 'text-orange-400', ringColor: 'border-orange-500/30 bg-orange-500/6' },
  { type: 'monitoring', label: 'Monitoring Agent', descKey: 'agentTeam.agent.monitoring.desc', promptHintKey: 'agentTeam.agent.monitoring.promptHint', icon: Eye, iconColor: 'text-cyan-400', ringColor: 'border-cyan-500/30 bg-cyan-500/6' },
]

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

function AgentCard({
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
  const setPipelineSubView = useUIStore(s => s.setPipelineSubView)
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
  const [saving, setSaving] = useState(false)
  const Icon = meta.icon

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
  }, [live?.id, live?.systemPromptTemplate, live?.toolManifest, live?.capabilities, live?.enabled, live?.requireApproval, live?.qualityGate, live?.graphId])

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

  const allToolNames = useMemo(() => {
    const names = live?.toolManifest ?? []
    return [...new Set(names)]
  }, [live?.toolManifest])

  const isActive = liveStatus !== 'idle'

  async function handleModelChange(newModel: string) {
    setModel(newModel)
    if (!agentId) return
    await workspaceApi.updateAgent(wsId, agentId, { preferredModel: newModel }).catch(() => {})
    await onRefresh()
  }

  async function handleToggle() {
    if (!agentId) return
    const newStatus = liveStatus === 'idle' ? 'waiting' : 'idle'
    await workspaceApi.updateAgent(wsId, agentId, { status: newStatus }).catch(() => {})
    await onRefresh()
  }

  async function handleAddAgent() {
    setSaving(true)
    try {
      await workspaceApi.createAgent(wsId, { type: meta.type })
      await onRefresh()
    } catch {
      addToast({ type: 'error', message: t('agentTeam.error.saveFailed' as TranslationKey) })
    } finally {
      setSaving(false)
    }
  }

  async function handleRemoveAgent() {
    if (!agentId) return
    if (!window.confirm(t('agentTeam.confirmDelete' as TranslationKey))) return
    setSaving(true)
    try {
      await workspaceApi.deleteAgent(wsId, agentId)
      await onRefresh()
    } catch {
      addToast({ type: 'error', message: t('agentTeam.error.saveFailed' as TranslationKey) })
    } finally {
      setSaving(false)
    }
  }

  function toggleTool(name: string) {
    setEnabledTools(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  async function handlePhaseEnabledToggle() {
    if (!agentId) return
    const next = !phaseEnabled
    setPhaseEnabled(next)
    await workspaceApi.updateAgent(wsId, agentId, { enabled: next }).catch(() => {})
    await onRefresh()
  }

  async function handleApprovalToggle() {
    if (!agentId) return
    const next = !requireApproval
    setRequireApproval(next)
    await workspaceApi.updateAgent(wsId, agentId, { requireApproval: next }).catch(() => {})
    await onRefresh()
  }

  async function handleGraphChange(newGraphId: string) {
    setGraphId(newGraphId)
    if (!agentId) return
    await workspaceApi.updateAgent(wsId, agentId, { graphId: newGraphId || null }).catch(() => {})
    await onRefresh()
  }

  function handleEditGraph() {
    setPipelineSubView('visual')
    setViewMode('pipeline')
  }

  async function handleSaveConfig() {
    if (!agentId) return
    let caps: Record<string, unknown>
    try {
      const parsed = JSON.parse(capsDraft.trim() || '{}') as unknown
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid')
      caps = parsed as Record<string, unknown>
    } catch {
      addToast({ type: 'error', message: t('agentTeam.error.invalidCapabilities' as TranslationKey) })
      return
    }
    setSaving(true)
    try {
      await workspaceApi.updateAgent(wsId, agentId, {
        systemPromptTemplate: promptDraft,
        toolManifest: [...enabledTools],
        capabilities: caps,
        qualityGate: qualityGate || null,
      })
      await onRefresh()
    } catch {
      addToast({ type: 'error', message: t('agentTeam.error.saveFailed' as TranslationKey) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={`rounded-xl border overflow-hidden transition-colors duration-150 ${isActive ? meta.ringColor : 'border-border-subtle bg-surface-1/20'}`}>
      <div className="flex items-start gap-3 p-4">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isActive ? 'bg-surface-3' : 'bg-surface-2'}`}>
          <Icon className={`w-4 h-4 ${isActive ? meta.iconColor : 'text-text-tertiary'}`} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`text-[12px] font-semibold ${isActive ? 'text-text-primary' : 'text-text-tertiary'}`}>{meta.label}</span>
            {model && <span className="text-[10px] font-mono text-text-tertiary bg-surface-3 px-1.5 py-0.5 rounded-md">{model}</span>}
            {!phaseEnabled && agentId && <span className="text-[9px] font-medium text-text-tertiary bg-surface-3 px-1.5 py-0.5 rounded-md uppercase">disabled</span>}
            <div className="flex items-center gap-1 ml-auto shrink-0">
              <div className={`w-1.5 h-1.5 rounded-full ${statusDot(liveStatus)}`} />
              <span className="text-[10px] text-text-tertiary capitalize">{liveStatus}</span>
            </div>
          </div>
          <p className="text-[11px] text-text-tertiary leading-relaxed">{t(meta.descKey)}</p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {!agentId ? (
            <button type="button" onClick={handleAddAgent} disabled={saving} className="flex items-center gap-1 rounded-md border border-border-subtle bg-surface-2/40 px-2 py-1.5 text-[11px] font-medium text-text-secondary hover:bg-surface-2/55 disabled:opacity-50 cursor-pointer">
              <Plus className="w-3.5 h-3.5" />
              {t('agentTeam.addAgent' as TranslationKey)}
            </button>
          ) : (
            <>
              <button type="button" onClick={handleToggle} className="cursor-pointer" aria-label="toggle active">
                {isActive ? <ToggleRight className="w-5 h-5 text-accent" /> : <ToggleLeft className="w-5 h-5 text-text-tertiary" />}
              </button>
              <button type="button" onClick={handleRemoveAgent} disabled={saving} className="w-8 h-8 flex items-center justify-center text-text-tertiary hover:text-danger transition-colors cursor-pointer disabled:opacity-40" aria-label="remove agent">
                <Trash2 className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => setExpanded(v => !v)} className="w-6 h-6 flex items-center justify-center text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer">
                {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </>
          )}
        </div>
      </div>

      {agentId && (
        <div className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`} inert={!expanded ? true : undefined}>
          <div className="min-h-0 overflow-hidden">
            <div className="px-4 pb-4 space-y-4 border-t border-border-subtle pt-4">

              {/* Model */}
              <div>
                <label className={labelClass}><Cpu className="w-3 h-3" />{t('agentTeam.field.model')}</label>
                <FormSelect size="sm" fullWidth value={model} options={modelSelectOptions} onChange={handleModelChange} />
              </div>

              {/* Execution config (merged from pipeline) */}
              <div>
                <label className={labelClass}><Workflow className="w-3 h-3" />{t('agentTeam.field.execution' as TranslationKey)}</label>
                <div className="space-y-3">
                  <label className="flex items-center gap-2.5 cursor-pointer group">
                    <button type="button" onClick={handlePhaseEnabledToggle} className="cursor-pointer" aria-label="toggle phase">
                      {phaseEnabled ? <ToggleRight className="w-5 h-5 text-accent" /> : <ToggleLeft className="w-5 h-5 text-text-tertiary" />}
                    </button>
                    <div>
                      <div className="text-[11px] font-medium text-text-secondary">{t('agentTeam.field.enabled' as TranslationKey)}</div>
                      <div className="text-[10px] text-text-tertiary">{t('agentTeam.field.enabledHint' as TranslationKey)}</div>
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer group">
                    <button type="button" onClick={handleApprovalToggle} className="cursor-pointer" aria-label="toggle approval">
                      {requireApproval ? <ToggleRight className="w-5 h-5 text-accent" /> : <ToggleLeft className="w-5 h-5 text-text-tertiary" />}
                    </button>
                    <div>
                      <div className="text-[11px] font-medium text-text-secondary">{t('agentTeam.field.requireApproval' as TranslationKey)}</div>
                      <div className="text-[10px] text-text-tertiary">{t('agentTeam.field.requireApprovalHint' as TranslationKey)}</div>
                    </div>
                  </label>

                  <div>
                    <div className="text-[10px] font-medium text-text-tertiary mb-1">{t('agentTeam.field.qualityGate' as TranslationKey)}</div>
                    <input type="text" value={qualityGate} onChange={e => setQualityGate(e.target.value)} placeholder={t('agentTeam.field.qualityGatePlaceholder' as TranslationKey)} className={inputClass} />
                  </div>

                  <div>
                    <div className="text-[10px] font-medium text-text-tertiary mb-1">{t('agentTeam.field.graph' as TranslationKey)}</div>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <FormSelect size="sm" fullWidth value={graphId} options={graphSelectOptions} onChange={handleGraphChange} />
                      </div>
                      <button type="button" onClick={handleEditGraph} className="rounded-md border border-border-subtle bg-surface-2/40 px-2.5 py-1.5 text-[10px] font-medium text-text-secondary hover:bg-surface-2/55 cursor-pointer flex items-center gap-1">
                        <GitBranch className="w-3 h-3" />
                        {t('agentTeam.field.editGraph' as TranslationKey)}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tools (checkbox picker) */}
              <div>
                <label className={labelClass}><Wrench className="w-3 h-3" />{t('agentTeam.field.tools')}</label>
                {allToolNames.length > 0 ? (
                  <div className="space-y-1.5">
                    {allToolNames.map(name => (
                      <label key={name} className="flex items-center gap-2 cursor-pointer group">
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

              {/* Capabilities JSON */}
              <div>
                <label className={labelClass}>{t('agentTeam.field.capabilities' as TranslationKey)}</label>
                <p className="text-[10px] text-text-tertiary mb-2">{t('agentTeam.field.capabilitiesHint' as TranslationKey)}</p>
                <textarea value={capsDraft} onChange={e => setCapsDraft(e.target.value)} rows={3} className={`${inputClass} font-mono resize-y min-h-[3rem]`} spellCheck={false} />
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
                const labelKey = trust.autonomy === 'autonomous' ? 'agentTeam.trust.autonomous' : trust.autonomy === 'semi_autonomous' ? 'agentTeam.trust.semiAutonomous' : 'agentTeam.trust.supervised'
                return (
                  <div>
                    <label className={labelClass}>
                      <AIcon className={`w-3 h-3 ${autonomyColor(trust.autonomy)}`} />
                      {t('agentTeam.trust.title' as TranslationKey)}
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
                        <div className={`text-[11px] font-semibold ${autonomyColor(trust.autonomy)}`}>{t(labelKey as TranslationKey)}</div>
                      </div>
                      <div className="rounded-lg bg-surface-2/40 border border-border-subtle p-2.5">
                        <div className="text-[10px] text-text-tertiary mb-1">{t('agentTeam.trust.calls' as TranslationKey)}</div>
                        <div className="text-sm font-semibold text-text-primary tabular-nums">{trust.total_calls}</div>
                      </div>
                    </div>
                  </div>
                )
              })()}

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
    if (activeWorkspaceId) {
      workspaceGraphApi.list(activeWorkspaceId).then(setGraphs).catch(() => {})
    }
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
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Bot className="w-4 h-4 text-accent" />
          <h1 className="text-base font-semibold text-text-primary tracking-tight">{t('agentTeam.title')}</h1>
          <span className="ml-auto text-[11px] font-mono text-text-tertiary">{activeCount}/{AGENT_META.length} {t('agentTeam.active')}</span>
        </div>
        <p className="text-[12px] text-text-tertiary">{t('agentTeam.desc')}</p>
      </div>

      <div className="rounded-xl border border-border-subtle bg-surface-1/30 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Settings2 className="w-3.5 h-3.5 text-text-tertiary" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">{t('agentTeam.roster')}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {AGENT_META.map(meta => {
            const live = liveAgents.find(a => a.type === meta.type)
            const isActive = live ? live.status !== 'idle' : false
            const MetaIcon = meta.icon
            return (
              <div key={meta.type} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-all ${isActive ? `${meta.ringColor} ${meta.iconColor}` : 'border-border-subtle bg-surface-2/40 text-text-tertiary opacity-50'}`}>
                <MetaIcon className="w-3 h-3" />
                {meta.label}
                {live && live.status !== 'idle' && <div className={`w-1 h-1 rounded-full ${statusDot(live.status)}`} />}
              </div>
            )
          })}
        </div>
      </div>

      <div className="space-y-2">
        {AGENT_META.map(meta => {
          const live = liveAgents.find(a => a.type === meta.type)
          const agentModel = live?.preferredModel ?? ''
          const trust = trustScores.find(s => s.agent_type === meta.type && s.model === agentModel)
            ?? trustScores.find(s => s.agent_type === meta.type)
          return (
            <AgentCard key={meta.type} meta={meta} live={live} wsId={activeWorkspaceId ?? ''} trust={trust} models={availableModels} graphs={graphs} onRefresh={onRefresh} />
          )
        })}
      </div>
    </motion.div>
  )
}
