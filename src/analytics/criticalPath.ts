import type { TraceSession, TraceSpan } from '../types'
import { sanitizeSession, sharePayloadTooLarge } from '../storage/sanitize'

export function findCriticalPath(spans: TraceSpan[]): Set<string> {
  if (!spans.length) return new Set()

  const byId = new Map(spans.map((s) => [s.id, s]))
  const children = new Map<string, TraceSpan[]>()
  const roots: TraceSpan[] = []

  for (const s of spans) {
    if (s.parentId && byId.has(s.parentId)) {
      const list = children.get(s.parentId) ?? []
      list.push(s)
      children.set(s.parentId, list)
    } else {
      roots.push(s)
    }
  }

  let bestPath: string[] = []
  let bestScore = -1

  const dfs = (span: TraceSpan, path: string[], score: number) => {
    const nextScore = score + Math.max(0, span.endMs - span.startMs)
    const kids = children.get(span.id) ?? []
    const nextPath = [...path, span.id]
    if (!kids.length) {
      if (nextScore > bestScore) {
        bestScore = nextScore
        bestPath = nextPath
      }
      return
    }
    for (const c of kids) dfs(c, nextPath, nextScore)
  }

  for (const r of roots) dfs(r, [], 0)
  return new Set(bestPath)
}

export function criticalPathDuration(spans: TraceSpan[], path: Set<string>): number {
  let sum = 0
  for (const s of spans) {
    if (path.has(s.id)) sum += Math.max(0, s.endMs - s.startMs)
  }
  return sum
}

export function nextCriticalPathSpanId(
  spans: TraceSpan[],
  selectedId: string | null,
): string | null {
  const path = findCriticalPath(spans)
  if (!path.size) return null
  const ordered = [...spans].sort((a, b) => a.startMs - b.startMs).filter((s) => path.has(s.id))
  if (!ordered.length) return null
  if (!selectedId) return ordered[0].id
  const idx = ordered.findIndex((s) => s.id === selectedId)
  if (idx === -1) return ordered[0].id
  return ordered[Math.min(ordered.length - 1, idx + 1)].id
}

export function parentSpanId(spans: TraceSpan[], selectedId: string | null): string | null {
  if (!selectedId) return null
  const cur = spans.find((s) => s.id === selectedId)
  return cur?.parentId && spans.some((s) => s.id === cur.parentId) ? cur.parentId : null
}

export function firstChildSpanId(spans: TraceSpan[], selectedId: string | null): string | null {
  if (!selectedId) return null
  const kids = spans
    .filter((s) => s.parentId === selectedId)
    .sort((a, b) => a.startMs - b.startMs)
  return kids[0]?.id ?? null
}

export function encodeSessionShare(session: TraceSession): string {
  const json = JSON.stringify(session)
  const bytes = new TextEncoder().encode(json)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const MAX_SHARE_DECODED_BYTES = 200_000

export function decodeSessionShare(raw: string): TraceSession | null {
  try {
    if (sharePayloadTooLarge(raw)) return null
    const b64 = raw.replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
    const bin = atob(b64 + pad)
    if (bin.length > MAX_SHARE_DECODED_BYTES) return null
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const json = new TextDecoder().decode(bytes)
    return sanitizeSession(JSON.parse(json))
  } catch {
    return null
  }
}