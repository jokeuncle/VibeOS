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

  useEffect(() => {
    if (prevId.current && prevId.current !== descriptor?.id) {
      unregister(prevId.current)
    }
    if (descriptor) {
      register(descriptor)
      prevId.current = descriptor.id
    } else if (prevId.current) {
      unregister(prevId.current)
      prevId.current = null
    }
    return () => {
      if (prevId.current) {
        unregister(prevId.current)
        prevId.current = null
      }
    }
  }, [descriptor?.id, descriptor, register, unregister])
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
