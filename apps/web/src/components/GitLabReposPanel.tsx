/**
 * GitLabReposPanel – Workspace repo binding settings.
 *
 * Orchestrates three views:
 *  1. Linked repos list (inline)
 *  2. Add credential form (GitLabCredentialForm)
 *  3. Bind repo form (GitLabRepoForm)
 */

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Plus, GitBranch, Trash2, CheckCircle, XCircle, Loader2,
  ExternalLink, Key, AlertTriangle,
} from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspace'
import { workspaceApi, gitlabCredentialApi } from '../lib/api'
import { useT } from '../i18n'
import type { GitLabCredential, WorkspaceRepo } from '../types'
import GitLabCredentialForm from './GitLabCredentialForm'
import GitLabRepoForm from './GitLabRepoForm'
import type { RepoFormData } from './GitLabRepoForm'

interface GitLabReposPanelProps {
  workspaceId: string
  onClose: () => void
}

type Step = 'list' | 'add-credential' | 'add-repo'

export default function GitLabReposPanel({ workspaceId, onClose }: GitLabReposPanelProps) {
  const t = useT()
  const { addRepo, removeRepo } = useWorkspaceStore()
  const repos = useWorkspaceStore((s) =>
    s.workspaces.find((w) => w.id === workspaceId)?.repos ?? []
  )

  const [step, setStep] = useState<Step>('list')
  const [credentials, setCredentials] = useState<GitLabCredential[]>([])
  const [loadingCreds, setLoadingCreds] = useState(false)
  const [deletingCredId, setDeletingCredId] = useState<string | null>(null)
  const [testingRepo, setTestingRepo] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string }>>({})
  const [error, setError] = useState('')

  useEffect(() => {
    setLoadingCreds(true)
    gitlabCredentialApi.list()
      .then(setCredentials)
      .catch(() => {})
      .finally(() => setLoadingCreds(false))
  }, [])

  function handleCredentialSaved(cred: GitLabCredential) {
    setCredentials((prev) => [...prev, cred])
    setError('')
    setStep('add-repo')
  }

  async function handleDeleteCredential(credId: string) {
    setDeletingCredId(credId)
    try {
      await gitlabCredentialApi.delete(credId)
      setCredentials((prev) => prev.filter((c) => c.id !== credId))
      setError('')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setDeletingCredId(null)
    }
  }

  async function handleRepoSave(data: RepoFormData) {
    const repo = await workspaceApi.createRepo(workspaceId, data)
    addRepo(workspaceId, repo)
    setError('')
    setStep('list')
  }

  async function handleDeleteRepo(repoId: string) {
    try {
      await workspaceApi.deleteRepo(workspaceId, repoId)
      removeRepo(workspaceId, repoId)
    } catch (e: any) {
      setError(e.message)
    }
  }

  async function handleTestConnection(repoId: string) {
    setTestingRepo(repoId)
    try {
      const result = await workspaceApi.testRepoConnection(workspaceId, repoId)
      const raw = result.message ?? ''
      const msg = raw.replace(/^connection (failed|successful):\s*/i, '')
      setTestResults((prev) => ({ ...prev, [repoId]: { ok: result.ok, message: msg } }))
    } catch (e: any) {
      setTestResults((prev) => ({ ...prev, [repoId]: { ok: false, message: e.message } }))
    } finally {
      setTestingRepo(null)
    }
  }

  function handleFooterLeft() {
    if (step === 'list') onClose()
    else { setStep('list'); setError('') }
  }

  const title = step === 'add-credential' ? t('gitlab.addInstance')
    : step === 'add-repo' ? t('gitlab.bindRepo')
    : t('gitlab.linkedRepos')

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.15 }}
        className="relative z-10 w-full max-w-lg max-h-[80vh] flex flex-col rounded-2xl bg-surface-1 border border-border-default shadow-2xl shadow-black/40 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 h-14 border-b border-border-subtle shrink-0">
          <div className="flex items-center gap-2.5">
            <GitBranch className="w-4 h-4 text-accent" />
            <span className="text-sm font-semibold text-text-primary">{title}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-tertiary hover:text-text-secondary hover:bg-surface-3 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Error banner */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-red-500/10 border-b border-red-500/20 px-5 py-2.5 text-xs text-red-400"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {step === 'list' && (
            <RepoList
              repos={repos}
              credentials={credentials}
              testingRepo={testingRepo}
              testResults={testResults}
              deletingCredId={deletingCredId}
              onTest={handleTestConnection}
              onDelete={handleDeleteRepo}
              onDeleteCredential={handleDeleteCredential}
              onAddCredential={() => { setStep('add-credential'); setError('') }}
              onAddRepo={() => { setStep('add-repo'); setError('') }}
            />
          )}

          {step === 'add-credential' && (
            <GitLabCredentialForm
              onSaved={handleCredentialSaved}
              onError={setError}
            />
          )}

          {step === 'add-repo' && (
            <GitLabRepoForm
              credentials={credentials}
              loadingCreds={loadingCreds}
              onSave={handleRepoSave}
              onError={setError}
            />
          )}
        </div>

        {/* Footer (list step only — form steps have their own footer) */}
        {step === 'list' && (
          <div className="shrink-0 flex items-center justify-between px-5 py-4 border-t border-border-subtle">
            <button
              onClick={handleFooterLeft}
              className="text-xs text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer"
            >
              {t('gitlab.close')}
            </button>
          </div>
        )}
      </motion.div>
    </div>
  )
}

/* ── Repo List (inline sub-component) ────────────────────────────── */

function RepoList({
  repos, credentials, testingRepo, testResults, deletingCredId,
  onTest, onDelete, onDeleteCredential, onAddCredential, onAddRepo,
}: {
  repos: WorkspaceRepo[]
  credentials: GitLabCredential[]
  testingRepo: string | null
  testResults: Record<string, { ok: boolean; message: string }>
  deletingCredId: string | null
  onTest: (id: string) => void
  onDelete: (id: string) => void
  onDeleteCredential: (id: string) => void
  onAddCredential: () => void
  onAddRepo: () => void
}) {
  const t = useT()

  return (
    <div className="space-y-3">
      {repos.length === 0 ? (
        <div className="text-center py-10 text-text-tertiary text-sm">
          <GitBranch className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>{t('gitlab.noRepos')}</p>
          <p className="text-xs mt-1 opacity-70">{t('gitlab.noReposHint')}</p>
        </div>
      ) : (
        repos.map((repo) => (
          <div key={repo.id} className="rounded-xl border border-border-subtle bg-surface-2 p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-text-primary truncate">{repo.projectName}</span>
                  {repo.isPrimary && (
                    <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-accent/15 text-accent">
                      {t('gitlab.primary')}
                    </span>
                  )}
                </div>
                <div className="text-xs text-text-tertiary mt-0.5 truncate">
                  {repo.gitlabUrl}/{repo.projectId}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {repo.projectUrl && (
                  <a
                    href={repo.projectUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-lg text-text-tertiary hover:text-text-secondary hover:bg-surface-3 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
                <button
                  onClick={() => onDelete(repo.id)}
                  className="p-1.5 rounded-lg text-text-tertiary hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3 text-xs text-text-tertiary">
              <span className="flex items-center gap-1">
                <GitBranch className="w-3 h-3" />
                {repo.branchStrategy} → {repo.branchDefault}
              </span>
              <span className="capitalize">{repo.role}</span>
              {repo.phaseTypes.length > 0 && <span>{repo.phaseTypes.join(', ')}</span>}
            </div>

            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => onTest(repo.id)}
                disabled={testingRepo === repo.id}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border border-border-subtle hover:bg-surface-3 transition-colors cursor-pointer disabled:opacity-50"
              >
                {testingRepo === repo.id
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <span>{t('gitlab.testConnection')}</span>}
              </button>
              {testResults[repo.id] && (
                <span className={`flex items-center gap-1 text-xs ${testResults[repo.id].ok ? 'text-green-400' : 'text-red-400'}`}>
                  {testResults[repo.id].ok ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                  {testResults[repo.id].ok
                    ? t('gitlab.connectionSuccess')
                    : `${t('gitlab.connectionFailed')}${testResults[repo.id].message ? ': ' + testResults[repo.id].message : ''}`}
                </span>
              )}
            </div>
          </div>
        ))
      )}

      <div className="flex gap-2 pt-2">
        <button
          onClick={onAddCredential}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border-default text-xs text-text-secondary hover:bg-surface-3 transition-colors cursor-pointer"
        >
          <Key className="w-3.5 h-3.5" />
          {t('gitlab.addInstanceBtn')}
        </button>
        {credentials.length > 0 && (
          <button
            onClick={onAddRepo}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent/90 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('gitlab.bindRepoBtn')}
          </button>
        )}
      </div>

      {credentials.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border-subtle">
          <p className="text-xs text-text-tertiary font-medium mb-2">{t('gitlab.instances')}</p>
          <div className="space-y-1.5">
            {credentials.map((c) => {
              const repoCount = repos.filter((r) => r.credentialId === c.id).length
              return (
                <div key={c.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-2 transition-colors group">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-text-secondary truncate">{c.label || c.gitlabUrl}</div>
                    <div className="text-[10px] text-text-quaternary">{c.gitlabUrl} · ···{c.tokenHint}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {repoCount > 0 && (
                      <span className="text-[10px] text-text-tertiary">{repoCount} repo{repoCount > 1 ? 's' : ''}</span>
                    )}
                    {repoCount > 0 ? (
                      <div title={t('gitlab.instanceHasRepos')} className="p-1 text-text-quaternary">
                        <AlertTriangle className="w-3 h-3" />
                      </div>
                    ) : (
                      <button
                        onClick={() => onDeleteCredential(c.id)}
                        disabled={deletingCredId === c.id}
                        className="p-1 rounded text-text-quaternary hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-50 opacity-0 group-hover:opacity-100"
                      >
                        {deletingCredId === c.id
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <Trash2 className="w-3 h-3" />
                        }
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
