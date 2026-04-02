/**
 * Unified SSE consumer for all frontend-AI interaction chains.
 *
 * All backend SSE events follow the format:
 *   event: <category>:<action>
 *   data: {"sid": "...", ...payload}
 *
 * Usage:
 *   const session = new ExecutionSession()
 *     .on('intent', handleIntent)
 *     .on('timeline', handleTimeline)
 *     .on('content', handleContentDelta)
 *     .on('session', handleSessionLifecycle)
 *
 *   await session.run('/api/nlp/stream', body)
 */

import { streamSSE } from './api'
import { registerActiveSid, unregisterActiveSid } from './ws'

export type EventCategory =
  | 'session'
  | 'intent'
  | 'timeline'
  | 'content'
  | 'tool'
  | 'task'
  | 'phase'
  | 'project'
  | 'graph'
  | 'agent'

export type EventHandler = (action: string, payload: any, sid: string) => void

export class ExecutionSession {
  private handlers = new Map<EventCategory, EventHandler[]>()
  private _sid: string | null = null
  private _aborted = false

  get sid(): string | null {
    return this._sid
  }

  on(category: EventCategory, handler: EventHandler): this {
    const list = this.handlers.get(category) || []
    list.push(handler)
    this.handlers.set(category, list)
    return this
  }

  abort(): void {
    this._aborted = true
  }

  async run(url: string, body: object): Promise<void> {
    try {
      for await (const evt of streamSSE(url, body)) {
        if (this._aborted) break

        const colonIdx = evt.event?.indexOf(':') ?? -1
        let category: string
        let action: string

        if (colonIdx > 0 && evt.event) {
          category = evt.event.slice(0, colonIdx)
          action = evt.event.slice(colonIdx + 1)
        } else {
          category = 'content'
          action = 'delta'
        }

        let data: any
        try {
          data = JSON.parse(evt.data)
        } catch {
          continue
        }

        const sid = data.sid || this._sid || ''
        if (data.sid && !this._sid) {
          this._sid = data.sid
          registerActiveSid(sid)
        }

        const handlers = this.handlers.get(category as EventCategory)
        if (handlers) {
          for (const handler of handlers) {
            handler(action, data, sid)
          }
        }
      }
    } finally {
      if (this._sid) {
        unregisterActiveSid(this._sid)
      }
    }
  }
}
