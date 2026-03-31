/**
 * Hooks for the NLP context abstraction layer.
 *
 * - useRegisterNlpContext(descriptor) — register on mount, unregister on unmount.
 * - useActiveNlpContext()             — read the resolved highest-priority context.
 * - useSlashCommands()                — merged global + view-specific slash commands.
 */

import { useEffect, useRef, useMemo } from 'react'
import { useUIStore } from '../stores/ui'
import { useWorkspaceStore } from '../stores/workspace'
import { resolveSlashCommands, type NlpContextDescriptor, type SlashCommand } from '../lib/nlpContext'

/**
 * Register an NlpContextDescriptor while the calling component is mounted.
 * Re-registers automatically when the descriptor identity (id) or content changes.
 */
export function useRegisterNlpContext(descriptor: NlpContextDescriptor | null): void {
  const register = useUIStore((s) => s.registerNlpContext)
  const unregister = useUIStore((s) => s.unregisterNlpContext)
  const prevId = useRef<string | null>(null)
  const descriptorRef = useRef(descriptor)
  descriptorRef.current = descriptor

  // Object identity changes every render for inline literals (e.g. WorkspaceHome's homeDesc).
  // Depending on `descriptor` re-ran the effect every time → unregister → store update →
  // re-render → infinite loop when the caller also subscribes to the full UI store.
  const descSig = descriptor ? JSON.stringify(descriptor) : null

  useEffect(() => {
    const d = descriptorRef.current
    if (!d) {
      if (prevId.current) {
        unregister(prevId.current)
        prevId.current = null
      }
      return
    }
    if (prevId.current && prevId.current !== d.id) {
      unregister(prevId.current)
    }
    register(d)
    prevId.current = d.id
    return () => {
      if (prevId.current) {
        unregister(prevId.current)
        prevId.current = null
      }
    }
  }, [descSig, register, unregister])
}

/** Read the resolved active context descriptor. */
export function useActiveNlpContext(): NlpContextDescriptor | null {
  return useUIStore((s) => s.activeNlpContext)
}

/** Merged slash commands for the current context. */
export function useSlashCommands(): SlashCommand[] {
  const active = useUIStore((s) => s.activeNlpContext)
  const isHome = !useWorkspaceStore((s) => s.activeWorkspaceId)

  return useMemo(
    () => resolveSlashCommands(active, isHome),
    [active, isHome],
  )
}
