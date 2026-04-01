import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plug2, Plus, Trash2, ToggleLeft, ToggleRight,
  Terminal, Globe, Zap, RefreshCw, ChevronDown, ChevronUp,
} from 'lucide-react'
import { extApi, type MCPServerEntry } from '../lib/api'
import { useWorkspaceStore } from '../stores/workspace'

type Transport = 'stdio' | 'sse' | 'streamable-http'

const TRANSPORT_META: Record<Transport, { icon: typeof Terminal; label: string; hint: string }> = {
  stdio:               { icon: Terminal, label: 'stdio',           hint: 'Local subprocess (command + args)' },
  sse:                 { icon: Globe,    label: 'SSE',             hint: 'Remote Server-Sent Events endpoint' },
  'streamable-http':   { icon: Zap,      label: 'Streamable HTTP', hint: 'Remote HTTP with streaming' },
}

export default function WorkspaceMCPServers() {
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? undefined
  const [servers, setServers] = useState<MCPServerEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await extApi.listMCPServers(workspaceId)
      setServers(data)
    } catch { /* ignore */ }
    setLoading(false)
  }, [workspaceId])

  useEffect(() => { load() }, [load])

  const toggle = async (srv: MCPServerEntry) => {
    try {
      const updated = await extApi.updateMCPServer(srv.id, { enabled: !srv.enabled })
      setServers(prev => prev.map(s => s.id === updated.id ? updated : s))
    } catch { /* ignore */ }
  }

  const remove = async (id: string) => {
    try {
      await extApi.deleteMCPServer(id)
      setServers(prev => prev.filter(s => s.id !== id))
    } catch { /* ignore */ }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Plug2 className="w-4 h-4 text-text-secondary" />
          <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
            MCP Servers
          </h3>
        </div>
        <div className="flex gap-2">
          <button
            onClick={load}
            className="rounded-md border border-border-subtle bg-surface-2/40 px-2.5 py-1.5 text-[11px] font-medium text-text-secondary hover:bg-surface-2/60 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
          <button
            onClick={() => setShowAdd(v => !v)}
            className="rounded-md bg-accent px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-accent/90 transition-colors flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> Add Server
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showAdd && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <AddServerForm
              workspaceId={workspaceId}
              onCreated={(s) => { setServers(prev => [...prev, s]); setShowAdd(false) }}
              onCancel={() => setShowAdd(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="text-xs text-text-tertiary py-8 text-center">Loading...</div>
      ) : servers.length === 0 ? (
        <div className="rounded-xl border border-border-subtle bg-surface-1/30 p-8 text-center">
          <Plug2 className="w-8 h-8 text-text-tertiary mx-auto mb-3 opacity-40" />
          <p className="text-xs text-text-tertiary">
            No MCP servers configured. Add one to extend agent capabilities.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {servers.map(srv => {
            const meta = TRANSPORT_META[srv.transport as Transport] || TRANSPORT_META.stdio
            const Icon = meta.icon
            const isExpanded = expanded === srv.id
            return (
              <div
                key={srv.id}
                className="rounded-xl border border-border-subtle bg-surface-1/30 overflow-hidden"
              >
                <div className="px-4 py-3 flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                    srv.enabled ? 'bg-accent/10 text-accent' : 'bg-surface-3 text-text-tertiary'
                  }`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-semibold text-text-secondary">{srv.name}</div>
                    <div className="text-[10px] text-text-tertiary">{meta.label} &middot; {srv.enabled ? 'Enabled' : 'Disabled'}</div>
                  </div>
                  <button
                    onClick={() => setExpanded(isExpanded ? null : srv.id)}
                    className="text-text-tertiary hover:text-text-secondary transition-colors"
                  >
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => toggle(srv)}
                    className={`transition-colors ${srv.enabled ? 'text-accent' : 'text-text-tertiary hover:text-text-secondary'}`}
                  >
                    {srv.enabled
                      ? <ToggleRight className="w-5 h-5" />
                      : <ToggleLeft className="w-5 h-5" />}
                  </button>
                  <button
                    onClick={() => remove(srv.id)}
                    className="text-text-tertiary hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: 'auto' }}
                      exit={{ height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-3 border-t border-border-subtle pt-3">
                        <pre className="text-[10px] text-text-tertiary font-mono bg-surface-2/40 rounded-lg p-3 overflow-auto max-h-48">
                          {JSON.stringify(srv.config, null, 2)}
                        </pre>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function AddServerForm({
  workspaceId,
  onCreated,
  onCancel,
}: {
  workspaceId?: string
  onCreated: (s: MCPServerEntry) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [transport, setTransport] = useState<Transport>('stdio')
  const [command, setCommand] = useState('')
  const [url, setUrl] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      const config: Record<string, unknown> = {}
      if (transport === 'stdio') {
        const parts = command.trim().split(/\s+/)
        config.command = parts[0]
        config.args = parts.slice(1)
      } else {
        config.url = url.trim()
      }
      const created = await extApi.createMCPServer({
        name: name.trim(),
        transport,
        config,
        workspaceId,
      })
      onCreated(created)
    } catch { /* ignore */ }
    setSaving(false)
  }

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-1/30 overflow-hidden">
      <div className="px-4 py-3 border-b border-border-subtle">
        <span className="text-[11px] font-semibold text-text-secondary">Add MCP Server</span>
      </div>
      <div className="p-4 space-y-3">
        <div>
          <label className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider block mb-1">Name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. my-gitlab-mcp"
            className="w-full text-xs rounded-lg bg-surface-2/40 border border-border-subtle px-3 py-2 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent/35 focus:border-accent/30"
          />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider block mb-1">Transport</label>
          <div className="flex gap-2">
            {(Object.keys(TRANSPORT_META) as Transport[]).map(t => (
              <button
                key={t}
                onClick={() => setTransport(t)}
                className={`flex-1 text-[11px] font-medium py-1.5 rounded-lg border transition-colors ${
                  transport === t
                    ? 'border-accent/50 bg-accent/10 text-accent'
                    : 'border-border-subtle bg-surface-2/40 text-text-secondary hover:bg-surface-2/60'
                }`}
              >
                {TRANSPORT_META[t].label}
              </button>
            ))}
          </div>
        </div>
        {transport === 'stdio' ? (
          <div>
            <label className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider block mb-1">Command</label>
            <input
              value={command}
              onChange={e => setCommand(e.target.value)}
              placeholder="e.g. npx -y @modelcontextprotocol/server-github"
              className="w-full text-xs rounded-lg bg-surface-2/40 border border-border-subtle px-3 py-2 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent/35 focus:border-accent/30 font-mono"
            />
          </div>
        ) : (
          <div>
            <label className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider block mb-1">URL</label>
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://mcp.example.com/sse"
              className="w-full text-xs rounded-lg bg-surface-2/40 border border-border-subtle px-3 py-2 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent/35 focus:border-accent/30 font-mono"
            />
          </div>
        )}
      </div>
      <div className="border-t border-border-subtle px-4 py-3 flex justify-end gap-2 bg-surface-2/20">
        <button
          onClick={onCancel}
          className="rounded-md border border-border-subtle bg-surface-2/40 px-3 py-1.5 text-[11px] font-medium text-text-secondary hover:bg-surface-2/60 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={saving || !name.trim()}
          className="rounded-md bg-accent px-3 py-1.5 text-[11px] font-medium text-white hover:bg-accent/90 transition-colors disabled:opacity-50"
        >
          {saving ? 'Adding...' : 'Add'}
        </button>
      </div>
    </div>
  )
}
