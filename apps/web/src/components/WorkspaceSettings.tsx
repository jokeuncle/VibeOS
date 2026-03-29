import { useState, useEffect } from 'react'
import { Check, X, GitBranch, UserPlus, Trash2 } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useWorkspaceStore } from '../stores/workspace'
import { useUIStore } from '../stores/ui'
import { useT } from '../i18n'
import { memberApi } from '../lib/api'
import GitLabReposPanel from './GitLabReposPanel'
import type { WorkspaceMember } from '../types'
import type { TranslationKey } from '../i18n/en'

const ROLES = ['owner', 'editor', 'viewer'] as const

export default function WorkspaceSettings() {
  const { activeWorkspaceId, workspaces, updateWorkspace } = useWorkspaceStore()
  const { addToast } = useUIStore()
  const t = useT()

  const workspace = workspaces.find(w => w.id === activeWorkspaceId)

  const [editingTitle, setEditingTitle] = useState(false)
  const [editingDesc, setEditingDesc] = useState(false)
  const [draftTitle, setDraftTitle] = useState(workspace?.name || '')
  const [draftDesc, setDraftDesc] = useState(workspace?.description || '')
  const [reposPanelOpen, setReposPanelOpen] = useState(false)

  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newRole, setNewRole] = useState<'editor' | 'viewer'>('editor')
  const [addingMember, setAddingMember] = useState(false)

  useEffect(() => {
    if (workspace) {
      setDraftTitle(workspace.name)
      setDraftDesc(workspace.description)
      setEditingTitle(false)
      setEditingDesc(false)
    }
  }, [workspace?.id])

  useEffect(() => {
    if (activeWorkspaceId) {
      setLoadingMembers(true)
      memberApi.list(activeWorkspaceId)
        .then(data => setMembers(Array.isArray(data) ? data : []))
        .catch(() => setMembers([]))
        .finally(() => setLoadingMembers(false))
    }
  }, [activeWorkspaceId])

  if (!workspace) return null

  function saveTitle() {
    if (draftTitle.trim()) {
      updateWorkspace(workspace!.id, { name: draftTitle.trim() })
      addToast({ type: 'success', message: t('settings.saved' as TranslationKey) })
    }
    setEditingTitle(false)
  }

  function saveDesc() {
    updateWorkspace(workspace!.id, { description: draftDesc.trim() })
    addToast({ type: 'success', message: t('settings.saved' as TranslationKey) })
    setEditingDesc(false)
  }

  async function handleAddMember() {
    if (!newEmail.trim() || !activeWorkspaceId) return
    setAddingMember(true)
    try {
      const member = await memberApi.add(activeWorkspaceId, newEmail.trim(), newRole)
      if (member) setMembers(prev => [...prev, member as WorkspaceMember])
      setNewEmail('')
      addToast({ type: 'success', message: t('settings.memberAdded' as TranslationKey) })
    } catch {
      addToast({ type: 'error', message: t('error.requestFailed') })
    } finally {
      setAddingMember(false)
    }
  }

  async function handleRemoveMember(memberId: string) {
    if (!activeWorkspaceId) return
    try {
      await memberApi.remove(activeWorkspaceId, memberId)
      setMembers(prev => prev.filter(m => m.id !== memberId))
      addToast({ type: 'success', message: t('settings.memberRemoved' as TranslationKey) })
    } catch {
      addToast({ type: 'error', message: t('error.requestFailed') })
    }
  }

  return (
    <div className="space-y-8">
      {/* Section: Workspace Info */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="rounded-xl border border-border-subtle bg-surface-1/30 p-6"
      >
        <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-5">
          {t('settings.workspaceInfo' as TranslationKey)}
        </h3>

        <div className="space-y-4">
          <div>
            <label className="text-[11px] font-medium text-text-tertiary mb-1.5 block">{t('template.name')}</label>
            {editingTitle ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditingTitle(false) }}
                  className="flex-1 text-sm text-text-primary bg-surface-2 rounded-lg px-3 py-2 outline-none border border-accent/40"
                />
                <button onClick={saveTitle} className="p-1.5 text-success hover:bg-surface-3 rounded-lg cursor-pointer"><Check className="w-4 h-4" /></button>
                <button onClick={() => setEditingTitle(false)} className="p-1.5 text-text-tertiary hover:bg-surface-3 rounded-lg cursor-pointer"><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <div
                onClick={() => { setDraftTitle(workspace.name); setEditingTitle(true) }}
                className="text-sm text-text-primary bg-surface-2/50 rounded-lg px-3 py-2 cursor-pointer hover:bg-surface-2 transition-colors"
              >
                {workspace.name || t('workspace.emptyName')}
              </div>
            )}
          </div>

          <div>
            <label className="text-[11px] font-medium text-text-tertiary mb-1.5 block">{t('template.description')}</label>
            {editingDesc ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={draftDesc}
                  onChange={(e) => setDraftDesc(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveDesc(); if (e.key === 'Escape') setEditingDesc(false) }}
                  className="flex-1 text-sm text-text-tertiary bg-surface-2 rounded-lg px-3 py-2 outline-none border border-accent/40"
                />
                <button onClick={saveDesc} className="p-1.5 text-success hover:bg-surface-3 rounded-lg cursor-pointer"><Check className="w-4 h-4" /></button>
                <button onClick={() => setEditingDesc(false)} className="p-1.5 text-text-tertiary hover:bg-surface-3 rounded-lg cursor-pointer"><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <div
                onClick={() => { setDraftDesc(workspace.description); setEditingDesc(true) }}
                className="text-sm text-text-tertiary bg-surface-2/50 rounded-lg px-3 py-2 cursor-pointer hover:bg-surface-2 transition-colors"
              >
                {workspace.description || t('workspace.emptyDesc')}
              </div>
            )}
          </div>
        </div>
      </motion.section>

      {/* Section: Repositories */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-xl border border-border-subtle bg-surface-1/30 p-6"
      >
        <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-5">
          {t('settings.repos' as TranslationKey)}
        </h3>

        <div className="flex items-center gap-3">
          <div className="flex-1">
            {workspace.repos?.length ? (
              <div className="space-y-2">
                {workspace.repos.map(repo => (
                  <div key={repo.id} className="flex items-center gap-2 text-sm text-text-secondary">
                    <GitBranch className="w-3.5 h-3.5 text-accent" />
                    <span>{repo.projectName}</span>
                    {repo.isPrimary && (
                      <span className="text-[9px] font-semibold text-accent bg-accent/10 px-1.5 py-0.5 rounded">
                        {t('gitlab.primary')}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-text-tertiary">{t('gitlab.noRepos')}</p>
            )}
          </div>
          <button
            onClick={() => setReposPanelOpen(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-3 hover:bg-surface-4 text-text-secondary text-xs font-medium cursor-pointer transition-colors"
          >
            <GitBranch className="w-3.5 h-3.5" />
            {t('gitlab.manageRepos' as TranslationKey)}
          </button>
        </div>

        <AnimatePresence>
          {reposPanelOpen && (
            <GitLabReposPanel
              workspaceId={workspace.id}
              onClose={() => setReposPanelOpen(false)}
            />
          )}
        </AnimatePresence>
      </motion.section>

      {/* Section: Members */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="rounded-xl border border-border-subtle bg-surface-1/30 p-6"
      >
        <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-5">
          {t('settings.members' as TranslationKey)}
        </h3>

        {/* Add member form */}
        <div className="flex items-center gap-2 mb-4">
          <input
            type="email"
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAddMember() }}
            placeholder={t('member.emailPlaceholder')}
            className="flex-1 text-sm text-text-primary bg-surface-2 rounded-lg px-3 py-2 outline-none border border-border-subtle focus:border-accent/40 transition-colors"
          />
          <select
            value={newRole}
            onChange={e => setNewRole(e.target.value as 'editor' | 'viewer')}
            className="text-xs text-text-secondary bg-surface-2 rounded-lg px-2 py-2 outline-none border border-border-subtle cursor-pointer"
          >
            <option value="editor">{t('settings.memberRole.editor' as TranslationKey)}</option>
            <option value="viewer">{t('settings.memberRole.viewer' as TranslationKey)}</option>
          </select>
          <button
            onClick={handleAddMember}
            disabled={addingMember || !newEmail.trim()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-medium cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <UserPlus className="w-3.5 h-3.5" />
            {t('settings.addMember' as TranslationKey)}
          </button>
        </div>

        {/* Member list */}
        {loadingMembers ? (
          <p className="text-xs text-text-tertiary py-2">{t('gitlab.loading')}</p>
        ) : members.length > 0 ? (
          <div className="space-y-1">
            {members.map(member => (
              <div key={member.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-2/50 group transition-colors">
                <div className="w-7 h-7 rounded-full bg-surface-3 flex items-center justify-center text-[11px] font-semibold text-text-secondary shrink-0">
                  {(member.userName || member.userEmail || '?')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-primary truncate">{member.userName || member.userEmail}</p>
                  {member.userName && member.userEmail && (
                    <p className="text-[10px] text-text-tertiary truncate">{member.userEmail}</p>
                  )}
                </div>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                  member.role === 'owner' ? 'bg-accent/10 text-accent'
                    : member.role === 'editor' ? 'bg-surface-3 text-text-secondary'
                    : 'bg-surface-3 text-text-tertiary'
                }`}>
                  {t(`settings.memberRole.${member.role}` as TranslationKey)}
                </span>
                {member.role !== 'owner' && (
                  <button
                    onClick={() => handleRemoveMember(member.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-text-tertiary hover:text-danger rounded transition-all cursor-pointer"
                    title={t('settings.removeMember' as TranslationKey)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-text-tertiary py-2">{t('member.title')}</p>
        )}
      </motion.section>
    </div>
  )
}
