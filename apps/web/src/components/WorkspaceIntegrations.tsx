import { useState, useMemo, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Plug2, CheckCircle2, Circle, ExternalLink,
  GitBranch, Zap, Bell, Cloud, Puzzle, Plus,
  ChevronRight, Settings2, AlertCircle, Link,
} from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspace'
import { useT } from '../i18n'
import type { TranslationKey } from '../i18n/en'

type IntegrationStatus = 'connected' | 'disconnected' | 'error'

interface Integration {
  id: string
  name: string
  descKey: TranslationKey
  categoryKey: TranslationKey
  status: IntegrationStatus
  detail?: string
  docsUrl?: string
}

const INTEGRATIONS: Integration[] = [
  {
    id: 'gitlab',
    name: 'GitLab',
    descKey: 'integrations.desc.gitlab',
    categoryKey: 'integrations.category.sourceControl',
    status: 'connected',
    detail: 'gitlab.com · 2 repos bound',
  },
  {
    id: 'github',
    name: 'GitHub',
    descKey: 'integrations.desc.github',
    categoryKey: 'integrations.category.sourceControl',
    status: 'disconnected',
  },
  {
    id: 'gitlab-ci',
    name: 'GitLab CI',
    descKey: 'integrations.desc.gitlabCi',
    categoryKey: 'integrations.category.cicd',
    status: 'connected',
    detail: 'Linked via GitLab integration',
  },
  {
    id: 'github-actions',
    name: 'GitHub Actions',
    descKey: 'integrations.desc.githubActions',
    categoryKey: 'integrations.category.cicd',
    status: 'disconnected',
  },
  {
    id: 'slack',
    name: 'Slack',
    descKey: 'integrations.desc.slack',
    categoryKey: 'integrations.category.notifications',
    status: 'disconnected',
  },
  {
    id: 'webhook',
    name: 'Webhook',
    descKey: 'integrations.desc.webhook',
    categoryKey: 'integrations.category.notifications',
    status: 'disconnected',
  },
  {
    id: 'datadog',
    name: 'Datadog',
    descKey: 'integrations.desc.datadog',
    categoryKey: 'integrations.category.monitoring',
    status: 'disconnected',
  },
  {
    id: 'grafana',
    name: 'Grafana',
    descKey: 'integrations.desc.grafana',
    categoryKey: 'integrations.category.monitoring',
    status: 'disconnected',
  },
  {
    id: 'aws',
    name: 'AWS',
    descKey: 'integrations.desc.aws',
    categoryKey: 'integrations.category.cloud',
    status: 'disconnected',
  },
  {
    id: 'gcp',
    name: 'Google Cloud',
    descKey: 'integrations.desc.gcp',
    categoryKey: 'integrations.category.cloud',
    status: 'disconnected',
  },
  {
    id: 'mcp-custom',
    name: 'Custom MCP Tool',
    descKey: 'integrations.desc.mcpCustom',
    categoryKey: 'integrations.category.mcp',
    status: 'disconnected',
  },
]

const CATEGORY_ICONS: Record<string, typeof GitBranch> = {
  'integrations.category.sourceControl': GitBranch,
  'integrations.category.cicd': Zap,
  'integrations.category.notifications': Bell,
  'integrations.category.monitoring': AlertCircle,
  'integrations.category.cloud': Cloud,
  'integrations.category.mcp': Puzzle,
}

const CATEGORY_ORDER: TranslationKey[] = [
  'integrations.category.sourceControl',
  'integrations.category.cicd',
  'integrations.category.notifications',
  'integrations.category.monitoring',
  'integrations.category.cloud',
  'integrations.category.mcp',
]

function StatusBadge({ status }: { status: IntegrationStatus }) {
  const t = useT()
  if (status === 'connected') {
    return (
      <span className="flex items-center gap-1 text-[10px] font-semibold text-success bg-success/10 border border-success/20 px-2 py-0.5 rounded-full">
        <CheckCircle2 className="w-2.5 h-2.5" />
        {t('integrations.status.connected')}
      </span>
    )
  }
  if (status === 'error') {
    return (
      <span className="flex items-center gap-1 text-[10px] font-semibold text-danger bg-danger/10 border border-danger/20 px-2 py-0.5 rounded-full">
        <AlertCircle className="w-2.5 h-2.5" />
        {t('integrations.status.error')}
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-[10px] font-semibold text-text-tertiary bg-surface-3 border border-border-subtle px-2 py-0.5 rounded-full">
      <Circle className="w-2.5 h-2.5" />
      {t('integrations.status.disconnected')}
    </span>
  )
}

function IntegrationRow({
  integration,
  onConnect,
}: {
  integration: Integration
  onConnect: (id: string) => void
}) {
  const t = useT()
  const isConnected = integration.status === 'connected'

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all
      ${isConnected
        ? 'bg-surface-1/40 border-border-subtle'
        : 'bg-surface-1/20 border-border-subtle hover:border-border-default hover:bg-surface-2/30'
      }`}
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0
        ${isConnected ? 'bg-surface-3' : 'bg-surface-2'}`}
      >
        <Link className={`w-3.5 h-3.5 ${isConnected ? 'text-accent' : 'text-text-tertiary'}`} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[12px] font-semibold text-text-primary">{integration.name}</span>
          {integration.detail && (
            <span className="text-[10px] font-mono text-text-tertiary">{integration.detail}</span>
          )}
        </div>
        <p className="text-[11px] text-text-tertiary truncate">{t(integration.descKey)}</p>
      </div>

      <StatusBadge status={integration.status} />

      <button
        onClick={() => onConnect(integration.id)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all cursor-pointer shrink-0
          ${isConnected
            ? 'text-text-tertiary hover:text-text-secondary hover:bg-surface-3'
            : 'bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20'
          }`}
      >
        {isConnected ? (
          <>
            <Settings2 className="w-3 h-3" />
            {t('integrations.action.manage')}
          </>
        ) : (
          <>
            <Plus className="w-3 h-3" />
            {t('integrations.action.connect')}
          </>
        )}
      </button>
    </div>
  )
}

export default function WorkspaceIntegrations() {
  const t = useT()
  const { workspaces, activeWorkspaceId } = useWorkspaceStore()
  const workspace = workspaces.find(w => w.id === activeWorkspaceId)
  const repos = workspace?.repos ?? []

  // Derive real GitLab status from workspace repos
  const gitlabRepos = repos.filter(r => r.gitlabUrl)
  const gitlabConnected = gitlabRepos.length > 0
  const gitlabDetail = gitlabConnected
    ? `${gitlabRepos.length} repo${gitlabRepos.length > 1 ? 's' : ''} bound`
    : undefined
  // GitLab CI is connected if there's a primary repo with a CI-capable strategy
  const gitlabCiConnected = gitlabRepos.some(r => r.isPrimary)

  const derivedIntegrations = useMemo<Integration[]>(() => INTEGRATIONS.map(i => {
    if (i.id === 'gitlab') return {
      ...i,
      status: gitlabConnected ? 'connected' : 'disconnected',
      detail: gitlabDetail,
    }
    if (i.id === 'gitlab-ci') return {
      ...i,
      status: gitlabCiConnected ? 'connected' : 'disconnected',
      detail: gitlabCiConnected ? 'Linked via GitLab integration' : undefined,
    }
    return i
  }), [gitlabConnected, gitlabDetail, gitlabCiConnected])

  const [integrations, setIntegrations] = useState<Integration[]>(derivedIntegrations)

  // Sync with real data when repos change (useEffect, not useMemo — this is a side effect)
  useEffect(() => {
    setIntegrations(derivedIntegrations)
  }, [derivedIntegrations])

  function handleConnect(id: string) {
    if (id === 'gitlab') {
      // Clicking GitLab navigates to the Integrations settings (repos panel)
      // The actual connection happens through WorkspaceSettings > GitLab Repos
      return
    }
    setIntegrations(prev =>
      prev.map(i => i.id === id && i.status === 'disconnected'
        ? { ...i, status: 'connected', detail: 'Just connected' }
        : i
      )
    )
  }

  const categories = CATEGORY_ORDER.filter(cat =>
    integrations.some(i => i.categoryKey === cat)
  )

  const connectedCount = integrations.filter(i => i.status === 'connected').length

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-6"
    >
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Plug2 className="w-4 h-4 text-accent" />
          <h1 className="text-base font-semibold text-text-primary tracking-tight">{t('integrations.title')}</h1>
          <span className="ml-auto text-[11px] font-mono text-text-tertiary">
            {connectedCount} {t('integrations.connected')}
          </span>
        </div>
        <p className="text-[12px] text-text-tertiary">{t('integrations.desc')}</p>
      </div>

      {connectedCount > 0 && (
        <div className="rounded-xl border border-border-subtle bg-surface-1/30 p-4">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="w-3.5 h-3.5 text-success" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">
              {t('integrations.activeConnections')}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {integrations.filter(i => i.status === 'connected').map(i => (
              <div key={i.id} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-success/20 bg-success/6 text-[11px] font-medium text-success">
                <CheckCircle2 className="w-3 h-3" />
                {i.name}
                {i.detail && <span className="text-[10px] text-success/70">· {i.detail}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {categories.map(categoryKey => {
        const CatIcon = CATEGORY_ICONS[categoryKey] || ChevronRight
        const items = integrations.filter(i => i.categoryKey === categoryKey)

        return (
          <div key={categoryKey} className="rounded-xl border border-border-subtle bg-surface-1/30 p-5">
            <div className="flex items-center gap-2 mb-4">
              <CatIcon className="w-3.5 h-3.5 text-text-tertiary" />
              <span className="text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">
                {t(categoryKey)}
              </span>
            </div>
            <div className="space-y-2">
              {items.map(integration => (
                <IntegrationRow
                  key={integration.id}
                  integration={integration}
                  onConnect={handleConnect}
                />
              ))}
            </div>
          </div>
        )
      })}

      <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-border-subtle bg-surface-1/20">
        <div className="flex items-center gap-2">
          <Puzzle className="w-3.5 h-3.5 text-text-tertiary" />
          <span className="text-[11px] text-text-tertiary">{t('integrations.mcpCallout')}</span>
        </div>
        <button className="flex items-center gap-1 text-[11px] text-accent hover:text-accent-hover transition-colors cursor-pointer">
          {t('integrations.mcpDocs')}
          <ExternalLink className="w-3 h-3" />
        </button>
      </div>
    </motion.div>
  )
}
