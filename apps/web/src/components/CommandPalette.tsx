import { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, Home, Plus, PanelLeftClose, Settings, Languages,
  Layers, ArrowRight, CheckSquare,
} from 'lucide-react'
import { useUIStore } from '../stores/ui'
import { useWorkspaceStore } from '../stores/workspace'
import { useI18nStore, useT } from '../i18n'
import { translateSeedTaskCopy } from '../lib/seedTaskI18n'
import type { TranslationKey } from '../i18n/en'

interface Command {
  id: string
  label: string
  icon: React.ReactNode
  category: string
  action: () => void
}

export default function CommandPalette() {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const { commandPaletteOpen, setCommandPaletteOpen, setSettingsOpen, toggleSidebar, setTemplatePickerOpen, openTaskDetail } = useUIStore()
  const { workspaces, setActiveWorkspace, activeWorkspaceId } = useWorkspaceStore()
  const { toggleLocale } = useI18nStore()
  const t = useT()

  const commands = useMemo<Command[]>(() => {
    const cmds: Command[] = []

    if (activeWorkspaceId) {
      cmds.push({
        id: 'go-home',
        label: t('command.goHome'),
        icon: <Home className="w-4 h-4" />,
        category: t('command.navigation'),
        action: () => setActiveWorkspace(null),
      })
    }

    workspaces.forEach((ws) => {
      if (ws.id !== activeWorkspaceId) {
        cmds.push({
          id: `go-${ws.id}`,
          label: `${t('command.goToWorkspace')}: ${ws.name || t('workspace.untitled')}`,
          icon: <Layers className="w-4 h-4" />,
          category: t('command.navigation'),
          action: () => setActiveWorkspace(ws.id),
        })
      }
    })

    workspaces.forEach((ws) => {
      ws.phases.forEach((phase) => {
        phase.tasks.forEach((task) => {
          const label = translateSeedTaskCopy(task.title, task.description, t as (k: TranslationKey) => string).title
          cmds.push({
            id: `task-${ws.id}-${phase.id}-${task.id}`,
            label,
            icon: <CheckSquare className="w-4 h-4" />,
            category: t('command.tasks'),
            action: () => {
              setActiveWorkspace(ws.id)
              openTaskDetail(phase.id, task.id)
            },
          })
        })
      })
    })

    cmds.push(
      {
        id: 'create-ws',
        label: t('command.createWorkspace'),
        icon: <Plus className="w-4 h-4" />,
        category: t('command.actions'),
        action: () => {
          setTemplatePickerOpen(true)
        },
      },
      ...(activeWorkspaceId
        ? [
            {
              id: 'toggle-sidebar',
              label: t('command.toggleSidebar'),
              icon: <PanelLeftClose className="w-4 h-4" />,
              category: t('command.actions'),
              action: toggleSidebar,
            } satisfies Command,
          ]
        : []),
      {
        id: 'open-settings',
        label: t('command.openSettings'),
        icon: <Settings className="w-4 h-4" />,
        category: t('command.actions'),
        action: () => setSettingsOpen(true),
      },
      {
        id: 'switch-lang',
        label: t('command.switchLang'),
        icon: <Languages className="w-4 h-4" />,
        category: t('command.actions'),
        action: toggleLocale,
      },
    )

    return cmds
  }, [activeWorkspaceId, workspaces, t, setActiveWorkspace, setTemplatePickerOpen, toggleSidebar, setSettingsOpen, toggleLocale, openTaskDetail])

  const filtered = useMemo(() => {
    if (!query.trim()) return commands
    const q = query.toLowerCase()
    return commands.filter((c) => c.label.toLowerCase().includes(q))
  }, [query, commands])

  const grouped = useMemo(() => {
    const map = new Map<string, Command[]>()
    filtered.forEach((c) => {
      const arr = map.get(c.category) || []
      arr.push(c)
      map.set(c.category, arr)
    })
    return map
  }, [filtered])

  /** Same order as rendered rows (category headers + commands) — must match keyboard selection. */
  const flatCommands = useMemo(() => {
    const out: Command[] = []
    for (const cmds of grouped.values()) {
      out.push(...cmds)
    }
    return out
  }, [grouped])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  useEffect(() => {
    setSelectedIndex((i) =>
      flatCommands.length === 0 ? 0 : Math.min(i, flatCommands.length - 1),
    )
  }, [flatCommands.length])

  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [commandPaletteOpen])

  useLayoutEffect(() => {
    if (!commandPaletteOpen || flatCommands.length === 0) return
    const row = listRef.current?.querySelector<HTMLElement>(`[data-palette-row="${selectedIndex}"]`)
    row?.scrollIntoView({ block: 'nearest' })
  }, [commandPaletteOpen, selectedIndex, flatCommands.length])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCommandPaletteOpen(!commandPaletteOpen)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [commandPaletteOpen, setCommandPaletteOpen])

  function runCommand(cmd: Command) {
    cmd.action()
    setCommandPaletteOpen(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    const n = flatCommands.length
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (n === 0) return
      setSelectedIndex((i) => Math.min(i + 1, n - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (n === 0) return
      setSelectedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && flatCommands[selectedIndex]) {
      runCommand(flatCommands[selectedIndex])
    } else if (e.key === 'Escape') {
      setCommandPaletteOpen(false)
    }
  }

  return (
    <AnimatePresence>
      {commandPaletteOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-[80]"
            onClick={() => setCommandPaletteOpen(false)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -10 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-lg z-[81] rounded-2xl border border-border-default bg-surface-1 shadow-2xl shadow-black/40 overflow-hidden"
          >
            <div className="flex items-center gap-3 px-4 h-12 border-b border-border-subtle">
              <Search className="w-4 h-4 text-text-tertiary shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('command.title')}
                className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary outline-none"
              />
              <kbd className="text-[10px] text-text-tertiary bg-surface-3 px-1.5 py-0.5 rounded font-mono border border-border-subtle">
                ESC
              </kbd>
            </div>

            <div ref={listRef} className="max-h-72 overflow-y-auto py-2">
              {filtered.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-text-tertiary">
                  {t('command.noResults')}
                </div>
              )}
              {(() => {
                let rowBase = 0
                return [...grouped.entries()].map(([category, cmds]) => {
                  const start = rowBase
                  rowBase += cmds.length
                  return (
                    <div key={category}>
                      <div className="px-4 py-1.5 text-[10px] font-medium text-text-tertiary uppercase tracking-wider">
                        {category}
                      </div>
                      {cmds.map((cmd, idxInGroup) => {
                        const rowIndex = start + idxInGroup
                        const isSelected = rowIndex === selectedIndex
                        return (
                          <button
                            key={cmd.id}
                            type="button"
                            data-palette-row={rowIndex}
                            onClick={() => runCommand(cmd)}
                            onMouseEnter={() => setSelectedIndex(rowIndex)}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-accent/10 text-accent'
                                : 'text-text-secondary hover:bg-surface-2'
                            }`}
                          >
                            <span className={isSelected ? 'text-accent' : 'text-text-tertiary'}>{cmd.icon}</span>
                            <span className="flex-1 text-left truncate">{cmd.label}</span>
                            {isSelected && <ArrowRight className="w-3.5 h-3.5 text-accent/50" />}
                          </button>
                        )
                      })}
                    </div>
                  )
                })
              })()}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
