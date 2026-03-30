import { useState, useEffect, useRef } from 'react'
import { Loader2, Search, X, ChevronDown } from 'lucide-react'
import FormSelect from './ui/FormSelect'
import { gitlabCredentialApi } from '../lib/api'
import { useT } from '../i18n'
import type { TranslationKey } from '../i18n/en'
import type { GitLabCredential, GitLabProjectResult, RepoBranchStrategy, RepoRole } from '../types'

interface GitLabRepoFormProps {
  credentials: GitLabCredential[]
  loadingCreds: boolean
  onSave: (data: RepoFormData) => Promise<void>
  onError: (msg: string) => void
}

export interface RepoFormData {
  credentialId: string
  projectId: string
  projectName: string
  projectUrl: string
  role: RepoRole
  isPrimary: boolean
  branchDefault: string
  branchStrategy: RepoBranchStrategy
  phaseTypes: string[]
}

const BRANCH_STRATEGY_KEYS: { value: RepoBranchStrategy; labelKey: TranslationKey; descKey: TranslationKey }[] = [
  { value: 'feature', labelKey: 'gitlab.strategyFeature', descKey: 'gitlab.strategyFeatureDesc' },
  { value: 'gitflow', labelKey: 'gitlab.strategyGitflow', descKey: 'gitlab.strategyGitflowDesc' },
  { value: 'direct', labelKey: 'gitlab.strategyDirect', descKey: 'gitlab.strategyDirectDesc' },
]

const ROLE_KEYS: { value: RepoRole; labelKey: TranslationKey }[] = [
  { value: 'primary', labelKey: 'gitlab.rolePrimary' },
  { value: 'secondary', labelKey: 'gitlab.roleSecondary' },
  { value: 'infra', labelKey: 'gitlab.roleInfra' },
  { value: 'docs', labelKey: 'gitlab.roleDocs' },
]

const PHASE_KEYS: { value: string; labelKey: TranslationKey }[] = [
  { value: 'requirement', labelKey: 'phase.short.requirement' },
  { value: 'architecture', labelKey: 'phase.short.architecture' },
  { value: 'design', labelKey: 'phase.short.design' },
  { value: 'development', labelKey: 'phase.short.development' },
  { value: 'testing', labelKey: 'phase.short.testing' },
  { value: 'cicd', labelKey: 'phase.short.cicd' },
  { value: 'monitoring', labelKey: 'phase.short.monitoring' },
]

function ProjectPicker({
  credentialId,
  onSelect,
}: {
  credentialId: string
  onSelect: (project: GitLabProjectResult) => void
}) {
  const t = useT()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GitLabProjectResult[]>([])
  const [searching, setSearching] = useState(false)
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<GitLabProjectResult | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setQuery('')
    setResults([])
    setSelected(null)
    setOpen(false)
  }, [credentialId])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!credentialId) return
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const data = await gitlabCredentialApi.searchProjects(credentialId, query)
        setResults(data)
        setOpen(true)
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, credentialId])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleSelect(project: GitLabProjectResult) {
    setSelected(project)
    setOpen(false)
    setQuery(project.pathWithNamespace)
    onSelect(project)
  }

  function handleClear() {
    setSelected(null)
    setQuery('')
    setResults([])
    setOpen(false)
  }

  return (
    <div ref={wrapperRef} className="relative">
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border-default bg-surface-2 focus-within:ring-1 focus-within:ring-accent/50">
        {searching
          ? <Loader2 className="w-3.5 h-3.5 text-text-tertiary shrink-0 animate-spin" />
          : <Search className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
        }
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSelected(null) }}
          onFocus={() => { if (results.length > 0) setOpen(true) }}
          placeholder={t('gitlab.searchProject')}
          className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-quaternary focus:outline-none"
        />
        {(query || selected) && (
          <button onClick={handleClear} className="text-text-tertiary hover:text-text-secondary cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        {!searching && !query && <ChevronDown className="w-3.5 h-3.5 text-text-tertiary shrink-0" />}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-52 overflow-y-auto rounded-lg border border-border-default bg-surface-1 shadow-xl shadow-black/30">
          {results.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => handleSelect(project)}
              className="w-full text-left px-3 py-2.5 hover:bg-surface-2 transition-colors border-b border-border-subtle last:border-0 cursor-pointer"
            >
              <div className="text-[12px] font-medium text-text-primary truncate">{project.name}</div>
              <div className="text-[10px] text-text-tertiary truncate">{project.pathWithNamespace}</div>
            </button>
          ))}
        </div>
      )}

      {open && !searching && results.length === 0 && query.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border-default bg-surface-1 px-3 py-3 text-xs text-text-tertiary shadow-xl shadow-black/30">
          {t('gitlab.noProjectsFound')}
        </div>
      )}
    </div>
  )
}

export default function GitLabRepoForm({ credentials, loadingCreds, onSave, onError }: GitLabRepoFormProps) {
  const t = useT()
  const [selectedCredId, setSelectedCredId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [projectName, setProjectName] = useState('')
  const [projectUrl, setProjectUrl] = useState('')
  const [role, setRole] = useState<RepoRole>('primary')
  const [isPrimary, setIsPrimary] = useState(true)
  const [branchDefault, setBranchDefault] = useState('main')
  const [branchStrategy, setBranchStrategy] = useState<RepoBranchStrategy>('feature')
  const [selectedPhases, setSelectedPhases] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  function handleProjectSelect(project: GitLabProjectResult) {
    setProjectId(project.id)
    setProjectName(project.name)
    setProjectUrl(project.webUrl)
  }

  function togglePhase(phase: string) {
    setSelectedPhases((prev) =>
      prev.includes(phase) ? prev.filter((p) => p !== phase) : [...prev, phase]
    )
  }

  async function handleSave() {
    if (!selectedCredId || !projectId || !projectName) {
      onError(t('gitlab.repoRequired'))
      return
    }
    setSaving(true)
    try {
      await onSave({
        credentialId: selectedCredId,
        projectId,
        projectName,
        projectUrl,
        role,
        isPrimary,
        branchDefault,
        branchStrategy,
        phaseTypes: selectedPhases,
      })
    } catch (e: any) {
      onError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="space-y-4">
        {/* Instance */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">{t('gitlab.instance')}</label>
          {loadingCreds ? (
            <div className="text-xs text-text-tertiary">{t('gitlab.loading')}</div>
          ) : (
            <FormSelect
              value={selectedCredId}
              placeholder={t('gitlab.selectInstance')}
              options={credentials.map((c) => ({
                value: c.id,
                label: `${c.label || c.gitlabUrl} (···${c.tokenHint})`,
              }))}
              onChange={(v) => { setSelectedCredId(v); setProjectId(''); setProjectName(''); setProjectUrl('') }}
            />
          )}
        </div>

        {/* Project search */}
        {selectedCredId && (
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">{t('gitlab.projectSearch')}</label>
            <ProjectPicker credentialId={selectedCredId} onSelect={handleProjectSelect} />
            {projectId && (
              <div className="mt-1.5 flex items-center gap-2 text-[11px] text-text-tertiary min-w-0">
                {projectUrl ? (
                  <a
                    href={projectUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={t('gitlab.openInGitLab')}
                    className="flex items-center gap-2 min-w-0 rounded-md -mx-1 px-1 py-0.5 text-text-tertiary hover:bg-surface-3/60 hover:text-text-secondary transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/40"
                  >
                    <span className="font-mono text-accent shrink-0">#{projectId}</span>
                    <span className="truncate">{projectName}</span>
                  </a>
                ) : (
                  <>
                    <span className="font-mono text-accent shrink-0">#{projectId}</span>
                    <span className="truncate">{projectName}</span>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Role + Primary */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">{t('gitlab.role')}</label>
            <FormSelect
              value={role}
              options={ROLE_KEYS.map((r) => ({ value: r.value, label: t(r.labelKey) }))}
              onChange={(v) => setRole(v as RepoRole)}
            />
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isPrimary}
                onChange={(e) => setIsPrimary(e.target.checked)}
                className="w-4 h-4 accent-accent rounded"
              />
              <span className="text-xs font-medium text-text-secondary">{t('gitlab.setAsPrimary')}</span>
            </label>
          </div>
        </div>

        {/* Branch strategy */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-2">{t('gitlab.branchStrategy')}</label>
          <div className="space-y-1.5">
            {BRANCH_STRATEGY_KEYS.map((bs) => (
              <label
                key={bs.value}
                className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                  branchStrategy === bs.value
                    ? 'border-accent/40 bg-accent/10'
                    : 'border-border-subtle hover:bg-surface-3'
                }`}
              >
                <input
                  type="radio"
                  name="branchStrategy"
                  value={bs.value}
                  checked={branchStrategy === bs.value}
                  onChange={() => setBranchStrategy(bs.value)}
                  className="accent-accent"
                />
                <div>
                  <div className="text-xs font-medium text-text-primary">{t(bs.labelKey)}</div>
                  <div className="text-[11px] text-text-tertiary">{t(bs.descKey)}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Default branch */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">{t('gitlab.defaultBranch')}</label>
          <input
            type="text"
            value={branchDefault}
            onChange={(e) => setBranchDefault(e.target.value)}
            placeholder="main"
            className="w-full px-3 py-2 rounded-lg border border-border-default bg-surface-2 text-sm text-text-primary placeholder:text-text-quaternary focus:outline-none focus:ring-1 focus:ring-accent/50"
          />
        </div>

        {/* Phase scope */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-2">
            {t('gitlab.phaseScope')} <span className="text-text-quaternary font-normal">({t('gitlab.phaseScopeHint')})</span>
          </label>
          <div className="flex flex-wrap gap-1.5">
            {PHASE_KEYS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => togglePhase(p.value)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                  selectedPhases.includes(p.value)
                    ? 'border-accent/40 bg-accent/15 text-accent'
                    : 'border-border-subtle text-text-tertiary hover:bg-surface-3'
                }`}
              >
                {t(p.labelKey)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 shrink-0 flex items-center justify-end py-4 border-t border-border-subtle">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-xs font-semibold hover:bg-accent/90 transition-colors cursor-pointer disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          {t('gitlab.bindRepoBtn')}
        </button>
      </div>
    </>
  )
}
