import { useEffect, useLayoutEffect, useRef } from 'react'
import { useWorkspaceStore } from '../stores/workspace'
import { useUIStore } from '../stores/ui'
import { parseURL, buildURL, currentURL } from '../lib/router'

/**
 * Bidirectional sync between Zustand navigation stores and the browser URL.
 *
 * - On mount: URL takes precedence over persisted store state (deep-link / refresh).
 * - On store change: URL is updated via pushState (debounced to coalesce rapid changes).
 * - On popstate (back/forward): stores are updated from URL.
 */
export function useURLSync() {
  const suppressSync = useRef(false)
  const pushTimer = useRef<number>(0)
  const mounted = useRef(false)

  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const activeRequirementId = useWorkspaceStore((s) => s.activeRequirementId)
  const activePhaseId = useWorkspaceStore((s) => s.activePhaseId)
  const viewMode = useUIStore((s) => s.viewMode)
  const reqSubView = useUIStore((s) => s.reqSubView)

  // ── URL → Stores ──────────────────────────────────────────────
  function applyURLToStores() {
    const route = parseURL(location.pathname, location.search)
    suppressSync.current = true

    const ws = useWorkspaceStore.getState()
    const ui = useUIStore.getState()

    if (route.workspaceId !== ws.activeWorkspaceId) {
      ws.setActiveWorkspace(route.workspaceId)
    }
    if (route.viewMode !== ui.viewMode) {
      ui.setViewMode(route.viewMode)
    }
    if (route.reqSubView !== ui.reqSubView) {
      ui.setReqSubView(route.reqSubView)
    }
    if (route.requirementId !== ws.activeRequirementId) {
      ws.setActiveRequirement(route.requirementId)
    }
    if (route.phaseId !== ws.activePhaseId) {
      ws.setActivePhase(route.phaseId)
    }

    // Normalize URL so reactive sync sees no diff
    const canonical = buildURL({
      workspaceId: route.workspaceId,
      viewMode: route.viewMode,
      requirementId: route.requirementId,
      reqSubView: route.reqSubView,
      phaseId: route.phaseId,
    })
    if (canonical !== currentURL()) {
      history.replaceState(null, '', canonical)
    }

    requestAnimationFrame(() => {
      suppressSync.current = false
    })
  }

  // Initial: if URL carries routing info, apply it to stores before paint.
  useLayoutEffect(() => {
    const route = parseURL(location.pathname, location.search)
    if (route.workspaceId) {
      applyURLToStores()
    }
    mounted.current = true
  }, [])

  // Browser back / forward
  useEffect(() => {
    const onPopState = () => applyURLToStores()
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  // ── Stores → URL (reactive) ───────────────────────────────────
  useEffect(() => {
    if (!mounted.current || suppressSync.current) return

    clearTimeout(pushTimer.current)
    pushTimer.current = window.setTimeout(() => {
      const url = buildURL({
        workspaceId: activeWorkspaceId,
        viewMode,
        requirementId: activeRequirementId,
        reqSubView,
        phaseId: activePhaseId,
      })
      if (url !== currentURL()) {
        history.pushState(null, '', url)
      }
    }, 80)

    return () => clearTimeout(pushTimer.current)
  }, [activeWorkspaceId, viewMode, activeRequirementId, reqSubView, activePhaseId])
}
