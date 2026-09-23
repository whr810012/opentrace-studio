import type { TraceEvent, TraceSession, TraceSpan } from '../types'

export function parseJsonl(text: string): TraceEvent[] {
  const events: TraceEvent[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    try {
      events.push(JSON.parse(line) as TraceEvent)
    } catch {
      throw new Error(`Invalid JSONL line: ${line.slice(0, 80)}`)
    }
  }
  return events
}

export function eventsToSessions(events: TraceEvent[]): TraceSession[] {
  const map = new Map<string, TraceSession>()

  for (const ev of events) {
    if (ev.type === 'session' && ev.session) {
      map.set(ev.session.id, { ...ev.session, spans: [] })
    }
  }

  for (const ev of events) {
    if (ev.type === 'span' && ev.span) {
      const { sessionId, ...span } = ev.span
      let session = map.get(sessionId)
      if (!session) {
        session = {
          id: sessionId,
          title: sessionId,
          startedAt: new Date().toISOString(),
          question: '(imported session)',
          spans: [],
        }
        map.set(sessionId, session)
      }
      session.spans.push(span as TraceSpan)
    }
  }

  for (const session of map.values()) {
    session.spans.sort((a, b) => a.startMs - b.startMs)
  }

  return Array.from(map.values())
}

export function sessionToJsonl(session: TraceSession): string {
  const { spans, ...meta } = session
  const lines: string[] = [
    JSON.stringify({
      type: 'session',
      session: meta,
    }),
  ]
  for (const span of [...spans].sort((a, b) => a.startMs - b.startMs)) {
    lines.push(
      JSON.stringify({
        type: 'span',
        span: { ...span, sessionId: session.id },
      }),
    )
  }
  return `${lines.join('\n')}\n`
}

export function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'application/x-ndjson;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function sessionDuration(session: TraceSession): number {
  if (!session.spans.length) return 0
  return Math.max(...session.spans.map((s) => s.endMs))
}

export interface SpanDiffRow {
  name: string
  a?: TraceSpan
  b?: TraceSpan
  durationDeltaMs: number | null
  statusChanged: boolean
}

export function diffSessionsByName(a: TraceSession, b: TraceSession): SpanDiffRow[] {
  const bucketsA = new Map<string, TraceSpan[]>()
  const bucketsB = new Map<string, TraceSpan[]>()

  for (const span of [...a.spans].sort((x, y) => x.startMs - y.startMs)) {
    const list = bucketsA.get(span.name) ?? []
    list.push(span)
    bucketsA.set(span.name, list)
  }
  for (const span of [...b.spans].sort((x, y) => x.startMs - y.startMs)) {
    const list = bucketsB.get(span.name) ?? []
    list.push(span)
    bucketsB.set(span.name, list)
  }

  const names = Array.from(new Set([...bucketsA.keys(), ...bucketsB.keys()]))
  const rows: SpanDiffRow[] = []

  for (const name of names) {
    const la = bucketsA.get(name) ?? []
    const lb = bucketsB.get(name) ?? []
    const n = Math.max(la.length, lb.length)
    for (let i = 0; i < n; i++) {
      const sa = la[i]
      const sb = lb[i]
      const da = sa ? sa.endMs - sa.startMs : null
      const db = sb ? sb.endMs - sb.startMs : null
      rows.push({
        name,
        a: sa,
        b: sb,
        durationDeltaMs: da !== null && db !== null ? db - da : null,
        statusChanged: Boolean(sa && sb && sa.status !== sb.status),
      })
    }
  }

  return rows
}

