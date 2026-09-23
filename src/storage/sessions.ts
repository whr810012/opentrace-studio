import type { TraceSession } from '../types'
import { sanitizeSessions } from './sanitize'

const SESSIONS_KEY = 'opentrace.sessions.v1'
const ACTIVE_KEY = 'opentrace.activeSessionId'
const MAX_SESSIONS = 20

export function loadSessions(): { sessions: TraceSession[]; activeId: string | null } {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    const sessions = sanitizeSessions(parsed).slice(0, MAX_SESSIONS)
    const activeId = localStorage.getItem(ACTIVE_KEY)
    const validActive =
      activeId && sessions.some((s) => s.id === activeId) ? activeId : sessions[0]?.id ?? null
    return { sessions, activeId: validActive }
  } catch {
    return { sessions: [], activeId: null }
  }
}

export function saveSessions(sessions: TraceSession[], activeId: string | null): boolean {
  const clipped = sessions.slice(0, MAX_SESSIONS)
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(clipped))
    if (activeId) localStorage.setItem(ACTIVE_KEY, activeId)
    else localStorage.removeItem(ACTIVE_KEY)
    return true
  } catch {
    // QuotaExceededError / private mode
    return false
  }
}
