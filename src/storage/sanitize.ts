import type { RagChunk, TraceSession, TraceSpan } from '../types'

const MAX_SHARE_RAW_CHARS = 100_000
/** In-memory / import observation cap (virtualized views). */
export const MAX_SPANS = 50_000
/** Tighten persisted sessions so localStorage stays usable. */
export const MAX_PERSIST_SPANS = 2_000
const MAX_TEXT_FIELD = 20_000
const MAX_JSON_CHARS = 80_000
const MAX_CHUNKS_PER_SPAN = 50
const MAX_META_KEYS = 40

function asNumber(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}

function clipText(s: string, max = MAX_TEXT_FIELD): string {
  return s.length > max ? `${s.slice(0, max)}…` : s
}

function clipJson(v: unknown): unknown {
  if (v === undefined) return undefined
  try {
    const s = JSON.stringify(v)
    if (s.length <= MAX_JSON_CHARS) return v
    return { _truncated: true, chars: s.length, preview: s.slice(0, 2_000) }
  } catch {
    return undefined
  }
}

function sanitizeMeta(
  raw: unknown,
): Record<string, string | number | boolean> | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const out: Record<string, string | number | boolean> = {}
  let n = 0
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (n >= MAX_META_KEYS) break
    if (typeof v === 'string') out[k] = clipText(v, 2_000)
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = v
    else if (typeof v === 'boolean') out[k] = v
    else continue
    n += 1
  }
  return Object.keys(out).length ? out : undefined
}

function sanitizeChunk(raw: unknown): RagChunk | null {
  if (!raw || typeof raw !== 'object') return null
  const c = raw as Record<string, unknown>
  if (typeof c.id !== 'string' || typeof c.source !== 'string' || typeof c.text !== 'string') {
    return null
  }
  return {
    id: clipText(c.id, 200),
    source: clipText(c.source, 500),
    text: clipText(c.text),
    score: asNumber(c.score, 0),
    url: typeof c.url === 'string' ? clipText(c.url, 2_000) : undefined,
  }
}

function sanitizeSpan(raw: unknown): TraceSpan | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Record<string, unknown>
  if (typeof s.id !== 'string' || typeof s.name !== 'string') return null
  const kind = s.kind
  const status = s.status
  const okKind =
    kind === 'llm' ||
    kind === 'tool' ||
    kind === 'retriever' ||
    kind === 'chain' ||
    kind === 'custom'
  const okStatus = status === 'ok' || status === 'error' || status === 'running'
  if (!okKind || !okStatus) return null

  const ragChunks = Array.isArray(s.ragChunks)
    ? (s.ragChunks
        .slice(0, MAX_CHUNKS_PER_SPAN)
        .map(sanitizeChunk)
        .filter(Boolean) as RagChunk[])
    : undefined

  return {
    id: clipText(s.id, 200),
    parentId: typeof s.parentId === 'string' ? clipText(s.parentId, 200) : undefined,
    name: clipText(s.name, 500),
    kind,
    status,
    startMs: asNumber(s.startMs),
    endMs: asNumber(s.endMs),
    input: clipJson(s.input),
    output: clipJson(s.output),
    error: typeof s.error === 'string' ? clipText(s.error, 8_000) : undefined,
    ragChunks,
    meta: sanitizeMeta(s.meta),
  }
}

export function sanitizeSession(raw: unknown): TraceSession | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Record<string, unknown>
  if (typeof s.id !== 'string' || !Array.isArray(s.spans)) return null
  if (s.spans.length > MAX_SPANS) return null

  const spans = s.spans.map(sanitizeSpan).filter(Boolean) as TraceSpan[]
  const meta = sanitizeMeta(s.meta)
  return {
    id: clipText(s.id, 200),
    title: typeof s.title === 'string' ? clipText(s.title, 500) : s.id,
    startedAt: typeof s.startedAt === 'string' ? s.startedAt : new Date().toISOString(),
    question: typeof s.question === 'string' ? clipText(s.question) : '',
    answer: typeof s.answer === 'string' ? clipText(s.answer) : undefined,
    model: typeof s.model === 'string' ? clipText(s.model, 200) : undefined,
    note: typeof s.note === 'string' ? clipText(s.note, 5_000) : undefined,
    pinnedSpanIds: Array.isArray(s.pinnedSpanIds)
      ? s.pinnedSpanIds.filter((x): x is string => typeof x === 'string').slice(0, 100)
      : undefined,
    spans,
    ...(meta ? { meta } : {}),
  }
}

/** Clip spans for localStorage persistence without rejecting large live sessions. */
export function clipSessionForPersist(session: TraceSession): TraceSession {
  if (session.spans.length <= MAX_PERSIST_SPANS) return session
  return {
    ...session,
    spans: session.spans.slice(0, MAX_PERSIST_SPANS),
    note: [session.note, `已截断至 ${MAX_PERSIST_SPANS} spans 以便本机持久化`]
      .filter(Boolean)
      .join(' · '),
  }
}

export function sanitizeSessions(list: unknown): TraceSession[] {
  if (!Array.isArray(list)) return []
  return list.map(sanitizeSession).filter(Boolean) as TraceSession[]
}

export function mergeSessionsFront(
  prev: TraceSession[],
  incoming: TraceSession[],
  max = 20,
): TraceSession[] {
  const incomingIds = new Set(incoming.map((s) => s.id))
  const rest = prev.filter((s) => !incomingIds.has(s.id))
  return [...incoming, ...rest].slice(0, max)
}

export function sharePayloadTooLarge(raw: string): boolean {
  return raw.length > MAX_SHARE_RAW_CHARS
}

export const MAX_IMPORT_CHARS = 2_000_000
/** Early File.size reject (bytes); same numeric budget as MAX_IMPORT_CHARS. */
export const MAX_IMPORT_BYTES = MAX_IMPORT_CHARS
