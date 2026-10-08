import type { ReactNode } from 'react'
import type { SpanKind, TraceSpan } from '../types'

export interface SpanRenderer {
  /** Detail panel body (INPUT/OUTPUT area). */
  renderDetail?: (span: TraceSpan) => ReactNode
  /** Optional chip after the span name on the timeline. */
  renderTimelineChip?: (span: TraceSpan) => ReactNode
  /** Optional waterfall / graph color override. */
  color?: string
}

const registry = new Map<string, SpanRenderer>()

function stringify(value: unknown) {
  if (value === undefined) return '—'
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function extractText(value: unknown, keys: string[]): string | null {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return null
  const obj = value as Record<string, unknown>
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'string' && v.trim()) return v
  }
  return null
}

export function LlmIoView({ span }: { span: TraceSpan }) {
  const prompt = extractText(span.input, ['prompt', 'text', 'content', 'task', 'model'])
  const completion = extractText(span.output, ['text', 'raw', 'completion', 'content'])

  return (
    <div className="llm-io">
      <div className="llm-meta">
        {span.meta?.tokens_in != null && <span>in {String(span.meta.tokens_in)}</span>}
        {span.meta?.tokens_out != null && <span>out {String(span.meta.tokens_out)}</span>}
        {span.meta?.streamed != null && <span>{span.meta.streamed ? 'stream' : 'sync'}</span>}
      </div>
      <h3 className="detail-h">PROMPT / INPUT</h3>
      <pre className="detail-pre llm-pre">{prompt || stringify(span.input)}</pre>
      <h3 className="detail-h">COMPLETION / OUTPUT</h3>
      <pre className="detail-pre llm-pre">{completion || stringify(span.output)}</pre>
      <details className="raw-details">
        <summary>原始 JSON</summary>
        <pre className="detail-pre">{stringify({ input: span.input, output: span.output })}</pre>
      </details>
    </div>
  )
}

export function DefaultIoView({ span }: { span: TraceSpan }) {
  return (
    <>
      <h3 className="detail-h">INPUT</h3>
      <pre className="detail-pre">{stringify(span.input)}</pre>
      <h3 className="detail-h">OUTPUT</h3>
      <pre className="detail-pre">{stringify(span.output)}</pre>
    </>
  )
}

const defaultRenderers: Partial<Record<SpanKind, SpanRenderer>> = {
  llm: {
    renderDetail: (span) => <LlmIoView span={span} />,
    renderTimelineChip: (span) => {
      const tin = Number(span.meta?.tokens_in)
      const tout = Number(span.meta?.tokens_out)
      if (!(tin > 0 || tout > 0)) return null
      return (
        <span className="token-chip" title={`tokens in ${tin || 0} / out ${tout || 0}`}>
          ↑{String(tin || 0)} ↓{String(tout || 0)}
        </span>
      )
    },
    color: 'var(--llm)',
  },
  tool: { renderDetail: (span) => <DefaultIoView span={span} />, color: 'var(--tool)' },
  retriever: {
    renderDetail: (span) => <DefaultIoView span={span} />,
    color: 'var(--retriever)',
  },
  chain: { renderDetail: (span) => <DefaultIoView span={span} />, color: 'var(--chain)' },
  custom: { renderDetail: (span) => <DefaultIoView span={span} />, color: 'var(--muted)' },
}

let defaultsInstalled = false

export function ensureDefaultSpanRenderers() {
  if (defaultsInstalled) return
  for (const [kind, renderer] of Object.entries(defaultRenderers)) {
    if (renderer && !registry.has(kind)) registry.set(kind, renderer)
  }
  defaultsInstalled = true
}

/** Register or override a renderer. Key is SpanKind or meta.renderHint / meta.plugin. */
export function registerSpanRenderer(key: string, renderer: SpanRenderer) {
  ensureDefaultSpanRenderers()
  registry.set(key, renderer)
}

export function getSpanRenderer(span: TraceSpan): SpanRenderer {
  ensureDefaultSpanRenderers()
  const hint =
    (typeof span.meta?.renderHint === 'string' && span.meta.renderHint) ||
    (typeof span.meta?.plugin === 'string' && span.meta.plugin) ||
    null
  if (hint && registry.has(hint)) return registry.get(hint)!
  return registry.get(span.kind) ?? defaultRenderers.custom!
}

export function resolveSpanColor(span: TraceSpan, fallbackMap?: Record<string, string>): string {
  const r = getSpanRenderer(span)
  if (r.color) return r.color
  return fallbackMap?.[span.kind] ?? fallbackMap?.custom ?? 'var(--muted)'
}
