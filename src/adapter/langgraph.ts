/** LangGraph / LangChain-style run export → TraceSession (offline thin adapter). */
import type { SpanKind, SpanStatus, TraceSession, TraceSpan } from '../types'

type AnyObj = Record<string, unknown>

export function looksLikeLangGraph(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (/"langgraph"|langgraph_version|"lc_run"|\"run_type\"\s*:\s*\"(chain|llm|tool|retriever)\"/.test(t)) {
    return true
  }
  try {
    const raw = JSON.parse(t.startsWith('[') ? t : t.split(/\n/)[0]!) as unknown
    if (Array.isArray(raw)) {
      return raw.some((x) => x && typeof x === 'object' && isLangGraphEvent(x as AnyObj))
    }
    if (raw && typeof raw === 'object') {
      const o = raw as AnyObj
      if (Array.isArray(o.runs) || Array.isArray(o.events) || o.langgraph) return true
      return isLangGraphEvent(o)
    }
  } catch {
    /* ignore */
  }
  return false
}

function isLangGraphEvent(o: AnyObj): boolean {
  const hasId = o.id != null || o.run_id != null
  const hasName = typeof o.name === 'string' && hasId
  const hasType = typeof o.run_type === 'string' || typeof o.event === 'string'
  const hasGraphHint =
    o.run_type != null || o.parent_run_id != null || o.langgraph_step != null || o.lc_run != null
  return (hasType || hasName) && hasGraphHint
}

export function langGraphToSessions(text: string): TraceSession[] {
  const events = collectEvents(text)
  if (!events.length) throw new Error('未识别到 LangGraph / LangChain run 事件')

  const byRoot = groupByRoot(events)
  const sessions: TraceSession[] = []
  let i = 0
  for (const [, list] of byRoot) {
    sessions.push(eventsToSession(list, i++))
  }
  return sessions
}

function collectEvents(text: string): AnyObj[] {
  const t = text.trim()
  const out: AnyObj[] = []
  const push = (raw: unknown) => {
    if (!raw || typeof raw !== 'object') return
    if (Array.isArray(raw)) {
      for (const x of raw) push(x)
      return
    }
    const o = raw as AnyObj
    if (Array.isArray(o.runs)) {
      const tid = o.trace_id ?? o.session_id ?? o.id
      for (const r of o.runs) {
        if (r && typeof r === 'object') {
          const run = { ...(r as AnyObj) }
          if (tid != null && run.trace_id == null) run.trace_id = tid
          push(run)
        }
      }
      return
    }
    if (Array.isArray(o.events)) {
      const tid = o.trace_id ?? o.session_id ?? o.id
      for (const e of o.events) {
        if (e && typeof e === 'object') {
          const ev = { ...(e as AnyObj) }
          if (tid != null && ev.trace_id == null) ev.trace_id = tid
          push(ev)
        }
      }
      return
    }
    out.push(o)
  }

  if (t.startsWith('{') || t.startsWith('[')) {
    try {
      push(JSON.parse(t))
      return out
    } catch {
      /* fall through to JSONL */
    }
  }
  for (const line of t.split(/\r?\n/)) {
    const s = line.trim()
    if (!s) continue
    try {
      push(JSON.parse(s))
    } catch {
      /* skip */
    }
  }
  return out
}

function groupByRoot(events: AnyObj[]): Map<string, AnyObj[]> {
  const map = new Map<string, AnyObj[]>()
  for (const e of events) {
    // Prefer explicit trace/session id so parent/child runs stay in one session.
    const key = String(e.trace_id ?? e.session_id ?? e.thread_id ?? 'lg-run')
    const list = map.get(key) ?? []
    list.push(e)
    map.set(key, list)
  }
  if (map.size === 0) map.set('lg-run', events)
  return map
}

function eventsToSession(events: AnyObj[], index: number): TraceSession {
  const t0 = minStart(events)
  const spans: TraceSpan[] = events.map((e, i) => {
    const id = String(e.id ?? e.run_id ?? `lg-${i}`)
    const parentRaw = e.parent_run_id ?? e.parent_id
    const parentId = parentRaw != null ? String(parentRaw) : undefined
    const start = toMs(e.start_time ?? e.startTime ?? e.started_at, t0, i * 10)
    const end = toMs(e.end_time ?? e.endTime ?? e.ended_at, t0, start + 5)
    const kind = mapKind(e)
    const status = mapStatus(e)
    const serialized = e.serialized as AnyObj | undefined
    const serializedId = Array.isArray(serialized?.id) ? serialized!.id as unknown[] : null
    const name = String(
      e.name ??
        (serializedId?.length ? serializedId[serializedId.length - 1] : null) ??
        kind,
    )
    const input = e.inputs ?? e.input ?? e.kwargs
    const output = e.outputs ?? e.output ?? e.data
    const error =
      status === 'error'
        ? String(e.error ?? e.exception ?? e.status_message ?? 'LangGraph error')
        : undefined
    const meta: Record<string, string | number | boolean> = { source: 'langgraph' }
    if (typeof e.model === 'string') meta.model = e.model
    const usage = (e.usage ?? {}) as AnyObj
    const usageMeta = (e.usage_metadata ?? {}) as AnyObj
    const tin = num(e.prompt_tokens ?? usage.prompt_tokens ?? usageMeta.input_tokens)
    const tout = num(e.completion_tokens ?? usage.completion_tokens ?? usageMeta.output_tokens)
    if (tin != null) meta.tokens_in = tin
    if (tout != null) meta.tokens_out = tout

    const ragChunks = parseDocs(e)

    return {
      id,
      parentId: parentId && parentId !== id ? parentId : undefined,
      name,
      kind,
      status,
      startMs: start,
      endMs: Math.max(start, end),
      input,
      output,
      error,
      meta,
      ...(ragChunks ? { ragChunks } : {}),
    }
  })

  spans.sort((a, b) => a.startMs - b.startMs)
  let question = '(langgraph run)'
  for (const e of events) {
    const inputs = e.inputs as AnyObj | undefined
    if (typeof inputs?.input === 'string' && inputs.input.trim()) {
      question = inputs.input
      break
    }
    if (typeof e.input === 'string' && e.input.trim()) {
      question = e.input
      break
    }
  }

  const answerSpan = [...spans].reverse().find((s) => s.kind === 'llm' && s.output)
  let answer: string | undefined
  if (typeof answerSpan?.output === 'string') answer = answerSpan.output
  else if (answerSpan?.output && typeof answerSpan.output === 'object') {
    const o = answerSpan.output as AnyObj
    answer = String(o.output ?? o.text ?? '') || undefined
  }

  return {
    id: `langgraph-${index}-${spans[0]?.id ?? index}`,
    title: `LangGraph · ${spans[0]?.name ?? index}`,
    startedAt: new Date().toISOString(),
    question: question.slice(0, 500),
    answer: answer?.slice(0, 4000),
    spans,
  }
}

function mapKind(e: AnyObj): SpanKind {
  const rt = String(e.run_type ?? e.type ?? e.event ?? '').toLowerCase()
  const name = String(e.name ?? '').toLowerCase()
  const blob = `${rt} ${name}`
  if (/retriev|rag|vector|embed|knowledge/.test(blob)) return 'retriever'
  if (/llm|chat|prompt|completion|openai/.test(blob)) return 'llm'
  if (/tool|function|action/.test(blob)) return 'tool'
  if (/chain|graph|agent|workflow|node/.test(blob)) return 'chain'
  return 'custom'
}

function mapStatus(e: AnyObj): SpanStatus {
  const s = String(e.status ?? e.state ?? '').toLowerCase()
  if (e.error || e.exception || s === 'error' || s === 'failed') return 'error'
  if (s === 'running' || s === 'pending') return 'running'
  return 'ok'
}

function minStart(events: AnyObj[]): number {
  const nums = events
    .map((e) => Date.parse(String(e.start_time ?? e.startTime ?? e.started_at ?? '')))
    .filter((n) => Number.isFinite(n))
  return nums.length ? Math.min(...nums) : Date.now()
}

function toMs(v: unknown, t0: number, fallback: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) {
    return v > 1e12 ? Math.max(0, Math.round(v - t0)) : Math.max(0, Math.round(v))
  }
  if (typeof v === 'string') {
    const p = Date.parse(v)
    if (Number.isFinite(p)) return Math.max(0, Math.round(p - t0))
  }
  return fallback
}

function num(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function parseDocs(e: AnyObj): TraceSpan['ragChunks'] {
  const docs = e.documents ?? e.docs ?? (e.outputs as AnyObj)?.documents
  if (!Array.isArray(docs)) return undefined
  const chunks = docs
    .map((d, i) => {
      if (typeof d === 'string') return { id: `doc-${i + 1}`, source: `doc-${i + 1}`, score: 0, text: d }
      if (!d || typeof d !== 'object') return null
      const o = d as AnyObj
      const text = String(o.page_content ?? o.text ?? o.content ?? '')
      if (!text) return null
      return {
        id: String(o.id ?? `doc-${i + 1}`),
        source: String((o.metadata as AnyObj)?.source ?? o.source ?? `doc-${i + 1}`),
        score: Number(o.score ?? 0) || 0,
        text,
      }
    })
    .filter(Boolean) as NonNullable<TraceSpan['ragChunks']>
  return chunks.length ? chunks : undefined
}
