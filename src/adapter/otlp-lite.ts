/** OTLP JSON subset → Session */
import type { SpanKind, SpanStatus, TraceSession, TraceSpan } from '../types'
import { sessionToJsonl } from './jsonl'

type AnyObj = Record<string, unknown>

interface OtlpAttr {
  key?: string
  value?: {
    stringValue?: string
    intValue?: string | number
    doubleValue?: number
    boolValue?: boolean
  }
}

interface OtlpSpan {
  traceId?: string
  spanId?: string
  parentSpanId?: string
  name?: string
  kind?: number
  startTimeUnixNano?: string | number
  endTimeUnixNano?: string | number
  status?: { code?: number; message?: string }
  attributes?: OtlpAttr[]
}

export function looksLikeOtlpJson(text: string): boolean {
  const t = text.trim()
  if (!t.startsWith('{') && !t.startsWith('[')) return false
  return /"resourceSpans"\s*:/.test(t) || /"scopeSpans"\s*:/.test(t)
}

export function otlpJsonToSessions(text: string): TraceSession[] {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('OTLP JSON 解析失败')
  }

  const spans = collectOtlpSpans(raw)
  if (!spans.length) {
    throw new Error('未找到 OTLP spans（需要 resourceSpans[].scopeSpans[].spans）。')
  }

  const byTrace = new Map<string, OtlpSpan[]>()
  for (const s of spans) {
    const tid = normalizeId(s.traceId) || 'otlp-trace'
    const list = byTrace.get(tid) ?? []
    list.push(s)
    byTrace.set(tid, list)
  }

  const sessions: TraceSession[] = []
  for (const [traceId, list] of byTrace) {
    sessions.push(otlpTraceToSession(traceId, list))
  }
  return sessions
}

export function otlpJsonToJsonl(text: string): string {
  const sessions = otlpJsonToSessions(text)
  return sessions.map((s) => sessionToJsonl(s).trimEnd()).join('\n') + '\n'
}

function collectOtlpSpans(raw: unknown): OtlpSpan[] {
  const out: OtlpSpan[] = []

  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const item of node) walk(item)
      return
    }
    const obj = node as AnyObj
    if (Array.isArray(obj.resourceSpans)) {
      for (const rs of obj.resourceSpans) walk(rs)
    }
    if (Array.isArray(obj.scopeSpans)) {
      for (const ss of obj.scopeSpans) walk(ss)
    }
    if (Array.isArray(obj.spans)) {
      for (const sp of obj.spans) {
        if (sp && typeof sp === 'object') out.push(sp as OtlpSpan)
      }
    }
  }

  walk(raw)
  return out
}

function otlpTraceToSession(traceId: string, list: OtlpSpan[]): TraceSession {
  const nanos = list
    .map((s) => toNano(s.startTimeUnixNano))
    .filter((n): n is number => n !== null)
  const t0 = nanos.length ? Math.min(...nanos) : 0

  const spans: TraceSpan[] = list.map((s, i) => {
    const startNano = toNano(s.startTimeUnixNano) ?? t0
    const endNano = toNano(s.endTimeUnixNano) ?? startNano
    const attrs = attrMap(s.attributes)
    const kind = inferKind(s.name ?? '', attrs)
    const status = mapStatus(s.status)
    const id = normalizeId(s.spanId) || `span-${i}`
    const parentRaw = normalizeId(s.parentSpanId)
    const parentId = parentRaw && parentRaw !== '0000000000000000' ? parentRaw : undefined

    const input = pickIo(attrs, 'input')
    const output = pickIo(attrs, 'output')
    const error =
      status === 'error'
        ? s.status?.message || attrs['exception.message'] || attrs['error'] || 'OTLP status ERROR'
        : undefined

    const meta: Record<string, string | number | boolean> = { source: 'otlp' }
    const model =
      attrs['gen_ai.request.model'] ||
      attrs['gen_ai.response.model'] ||
      attrs['llm.model_name'] ||
      attrs['llm.model']
    if (model) meta.model = model
    if (attrs['gen_ai.system']) meta.gen_ai_system = attrs['gen_ai.system']
    if (attrs['gen_ai.operation.name']) meta.gen_ai_op = attrs['gen_ai.operation.name']
    if (attrs['openinference.span.kind']) meta.openinference_kind = attrs['openinference.span.kind']
    if (attrs['tool.name']) meta.tool_name = attrs['tool.name']
    if (attrs['server.address']) meta.server_address = attrs['server.address']

    const tokensIn = firstNumber(attrs, [
      'gen_ai.usage.input_tokens',
      'gen_ai.usage.prompt_tokens',
      'llm.token_count.prompt',
      'llm.usage.prompt_tokens',
      'llm.token_count.total',
    ])
    const tokensOut = firstNumber(attrs, [
      'gen_ai.usage.output_tokens',
      'gen_ai.usage.completion_tokens',
      'llm.token_count.completion',
      'llm.usage.completion_tokens',
    ])
    if (tokensIn != null) meta.tokens_in = tokensIn
    if (tokensOut != null) meta.tokens_out = tokensOut

    const totalTokens = firstNumber(attrs, ['gen_ai.usage.total_tokens', 'llm.usage.total_tokens'])
    if (totalTokens != null) meta.tokens_total = totalTokens

    const ragChunks = parseRagChunks(attrs)

    return {
      id,
      parentId,
      name: s.name || id,
      kind,
      status,
      startMs: Math.max(0, Math.round((startNano - t0) / 1e6)),
      endMs: Math.max(0, Math.round((endNano - t0) / 1e6)),
      input,
      output,
      error,
      meta,
      ...(ragChunks?.length ? { ragChunks } : {}),
    }
  })

  spans.sort((a, b) => a.startMs - b.startMs)

  const question =
    firstAttr(list, ['gen_ai.prompt', 'user.question', 'input.value', 'http.target']) ||
    '(imported OTLP trace)'
  const answer =
    firstAttr(list, ['gen_ai.completion', 'output.value', 'gen_ai.response']) || undefined

  const short = traceId.length > 12 ? `${traceId.slice(0, 12)}…` : traceId
  return {
    id: `otlp-${traceId.slice(0, 16) || short}`,
    title: `OTLP · ${short}`,
    startedAt: new Date().toISOString(),
    question: String(question).slice(0, 500),
    answer: answer ? String(answer).slice(0, 4000) : undefined,
    spans,
  }
}

function toNano(v: string | number | undefined): number | null {
  if (v === undefined || v === null || v === '') return null
  if (typeof v === 'number') return v
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function normalizeId(id: string | undefined): string {
  if (!id) return ''
  return id.replace(/^0x/i, '').toLowerCase()
}

function attrMap(attrs: OtlpAttr[] | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!attrs) return out
  for (const a of attrs) {
    if (!a?.key) continue
    const v = a.value
    if (!v) continue
    if (v.stringValue !== undefined) out[a.key] = v.stringValue
    else if (v.intValue !== undefined) out[a.key] = String(v.intValue)
    else if (v.doubleValue !== undefined) out[a.key] = String(v.doubleValue)
    else if (v.boolValue !== undefined) out[a.key] = String(v.boolValue)
  }
  return out
}

function inferKind(name: string, attrs: Record<string, string>): SpanKind {
  const oi = (attrs['openinference.span.kind'] || attrs['gen_ai.operation.name'] || '').toLowerCase()
  if (oi === 'retriever' || oi === 'embedding' || oi === 'reranker') return 'retriever'
  if (oi === 'llm' || oi === 'chat' || oi === 'completion') return 'llm'
  if (oi === 'tool' || oi === 'agent') return oi === 'agent' ? 'chain' : 'tool'
  if (oi === 'chain' || oi === 'workflow') return 'chain'

  const blob = `${name} ${Object.keys(attrs).join(' ')} ${Object.values(attrs).join(' ')}`.toLowerCase()
  if (/retriev|rag|vector|embed|knowledge/.test(blob)) return 'retriever'
  if (/gen_ai|openai|chat\.completions|llm|completion|prompt/.test(blob)) return 'llm'
  if (/tool|function\.call|http\.|fetch|weather|geocode/.test(blob)) return 'tool'
  if (/agent|chain|workflow|plan|orchestr/.test(blob)) return 'chain'
  return 'custom'
}

function mapStatus(status: OtlpSpan['status']): SpanStatus {
  // OTLP: UNSET=0, OK=1, ERROR=2
  if (status?.code === 2) return 'error'
  return 'ok'
}

function pickIo(attrs: Record<string, string>, side: 'input' | 'output'): unknown {
  const keys =
    side === 'input'
      ? [
          'gen_ai.prompt',
          'gen_ai.input.messages',
          'llm.input_messages',
          'llm.prompts',
          'input.value',
          'input',
          'http.request.body',
          'tool.arguments',
          'tool.parameters',
          'retrieval.query',
          'openinference.span.kind',
        ]
      : [
          'gen_ai.completion',
          'gen_ai.output.messages',
          'gen_ai.response.text',
          'llm.output_messages',
          'llm.completions',
          'output.value',
          'output',
          'http.response.body',
          'tool.result',
          'tool.output',
        ]
  for (const k of keys) {
    if (attrs[k] && k !== 'openinference.span.kind') return tryParseJson(attrs[k])
  }
  // OpenInference message arrays: llm.input_messages.0.message.content
  const msgPrefix = side === 'input' ? 'llm.input_messages.' : 'llm.output_messages.'
  const msgs: string[] = []
  for (const [k, v] of Object.entries(attrs)) {
    if (k.includes('.message.content') && k.startsWith(msgPrefix)) msgs.push(v)
  }
  if (msgs.length) return msgs.length === 1 ? msgs[0] : msgs

  const prefix = side === 'input' ? 'input.' : 'output.'
  const picked: Record<string, string> = {}
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith(prefix) || k.startsWith(`gen_ai.${side}`)) picked[k] = v
  }
  return Object.keys(picked).length ? picked : undefined
}

function tryParseJson(s: string): unknown {
  const t = s.trim()
  if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
    try {
      return JSON.parse(t)
    } catch {
      return s
    }
  }
  return s
}

function firstNumber(attrs: Record<string, string>, keys: string[]): number | null {
  for (const k of keys) {
    if (attrs[k] === undefined) continue
    const n = Number(attrs[k])
    if (Number.isFinite(n)) return n
  }
  return null
}

/** Best-effort OpenInference / custom retrieval documents → RagChunk[] */
function parseRagChunks(attrs: Record<string, string>): TraceSpan['ragChunks'] {
  const raw =
    attrs['retrieval.documents'] ||
    attrs['retrieval.docs'] ||
    attrs['rag.chunks'] ||
    attrs['documents'] ||
    attrs['db.collection.documents'] ||
    attrs['gen_ai.retrieval.documents']
  if (!raw) {
    // OpenInference indexed document attributes
    const indexed: NonNullable<TraceSpan['ragChunks']> = []
    for (let i = 0; i < 50; i += 1) {
      const text =
        attrs[`retrieval.documents.${i}.document.content`] ||
        attrs[`document.${i}.content`] ||
        attrs[`gen_ai.retrieval.document.${i}.content`]
      if (!text) {
        if (i > 0 && !attrs[`retrieval.documents.${i}.document.content`]) break
        continue
      }
      const score = Number(
        attrs[`retrieval.documents.${i}.document.score`] ||
          attrs[`document.${i}.score`] ||
          attrs[`retrieval.score_${i}`] ||
          0,
      )
      indexed.push({
        id: attrs[`retrieval.documents.${i}.document.id`] || `doc-${i + 1}`,
        source:
          attrs[`retrieval.documents.${i}.document.metadata.source`] ||
          attrs[`document.${i}.metadata.source`] ||
          `doc-${i + 1}`,
        score: Number.isFinite(score) ? score : 0,
        text,
      })
    }
    return indexed.length ? indexed : undefined
  }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return undefined
    const chunks = parsed
      .map((item, i) => {
        if (typeof item === 'string') {
          return { id: `doc-${i + 1}`, source: `doc-${i + 1}`, score: 0, text: item }
        }
        if (!item || typeof item !== 'object') return null
        const o = item as Record<string, unknown>
        const nested =
          o.document && typeof o.document === 'object'
            ? (o.document as Record<string, unknown>)
            : o
        const text = String(nested.text ?? nested.content ?? nested.document ?? o.content ?? '')
        if (!text) return null
        const score = Number(
          nested.score ?? o.score ?? o.relevance_score ?? attrs[`retrieval.score_${i}`] ?? 0,
        )
        return {
          id: String(nested.id ?? o.id ?? `doc-${i + 1}`),
          source: String(nested.source ?? nested.filename ?? o.source ?? `doc-${i + 1}`),
          score: Number.isFinite(score) ? score : 0,
          text,
          ...(typeof nested.url === 'string'
            ? { url: nested.url }
            : typeof o.url === 'string'
              ? { url: o.url }
              : {}),
        }
      })
      .filter((c): c is NonNullable<typeof c> => Boolean(c))
    return chunks.length ? chunks : undefined
  } catch {
    return undefined
  }
}

function firstAttr(list: OtlpSpan[], keys: string[]): string | undefined {
  for (const s of list) {
    const m = attrMap(s.attributes)
    for (const k of keys) {
      if (m[k]) return m[k]
    }
  }
  return undefined
}
