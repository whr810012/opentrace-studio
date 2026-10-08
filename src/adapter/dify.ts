/** Dify workflow / app run export → TraceSession (offline thin adapter). */
import type { SpanKind, SpanStatus, TraceSession, TraceSpan } from '../types'

type AnyObj = Record<string, unknown>

export function looksLikeDify(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (/"workflow_run_id"|\"node_type\"\s*:|"dify"|\"app_mode\"\s*:\s*\"(workflow|advanced-chat|agent-chat)\"/.test(t)) {
    return true
  }
  try {
    const raw = JSON.parse(t) as unknown
    if (!raw || typeof raw !== 'object') return false
    const o = raw as AnyObj
    if (o.workflow_run_id || o.workflow_id) return true
    if (Array.isArray(o.graph) || Array.isArray(o.nodes) || Array.isArray(o.execution_metadata)) return true
    if (Array.isArray(o.data) && o.data.some((x) => x && typeof x === 'object' && 'node_type' in (x as object))) {
      return true
    }
  } catch {
    /* ignore */
  }
  return false
}

export function difyToSessions(text: string): TraceSession[] {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('Dify JSON 解析失败')
  }
  if (!raw || typeof raw !== 'object') throw new Error('Dify 导出走 JSON 对象')

  const o = raw as AnyObj
  const nodes = collectNodes(o)
  if (!nodes.length) throw new Error('未找到 Dify 节点执行记录（nodes / data / graph）')

  const runId = String(o.workflow_run_id ?? o.id ?? o.task_id ?? `dify-${Date.now()}`)
  const t0 = minElapsed(nodes)
  const spans: TraceSpan[] = nodes.map((n, i) => nodeToSpan(n, i, t0, runId))
  spans.sort((a, b) => a.startMs - b.startMs)

  const inputs = (o.inputs ?? {}) as AnyObj
  const outputs = (o.outputs ?? {}) as AnyObj
  const question = String(
    o.query ?? inputs.query ?? inputs.input ?? o.user_input ?? '(dify run)',
  ).slice(0, 500)
  const answer = String(o.answer ?? outputs.answer ?? o.output_text ?? '').slice(0, 4000) || undefined

  return [
    {
      id: `dify-${runId}`.slice(0, 80),
      title: `Dify · ${String(o.workflow_id ?? runId).slice(0, 24)}`,
      startedAt: typeof o.created_at === 'string' ? o.created_at : new Date().toISOString(),
      question,
      answer,
      model: typeof o.model === 'string' ? o.model : undefined,
      spans,
    },
  ]
}

function collectNodes(o: AnyObj): AnyObj[] {
  const candidates = [o.nodes, o.data, o.graph, o.execution_metadata, o.node_executions]
  for (const c of candidates) {
    if (Array.isArray(c) && c.length && typeof c[0] === 'object') {
      return c as AnyObj[]
    }
  }
  if (o.data && typeof o.data === 'object' && Array.isArray((o.data as AnyObj).outputs)) {
    return (o.data as AnyObj).outputs as AnyObj[]
  }
  return []
}

function nodeToSpan(n: AnyObj, i: number, t0: number, runId: string): TraceSpan {
  const id = String(n.id ?? n.node_id ?? n.execution_id ?? `${runId}-n${i}`)
  const parentId =
    n.predecessor_node_id != null
      ? String(n.predecessor_node_id)
      : n.parent_id != null
        ? String(n.parent_id)
        : undefined
  const start = elapsedMs(n.created_at ?? n.start_at ?? n.elapsed_time, t0, i * 20)
  const dur = Number(n.elapsed_time ?? n.execution_time ?? 50)
  const end = start + (Number.isFinite(dur) ? Math.round(dur * (dur < 100 ? 1000 : 1)) : 50)
  const kind = mapKind(n)
  const status = mapStatus(n)
  const name = String(n.title ?? n.node_type ?? n.type ?? `node-${i}`)
  const input = n.inputs ?? n.input
  const output = n.outputs ?? n.output ?? n.process_data
  const error =
    status === 'error' ? String(n.error ?? n.status ?? 'Dify node error') : undefined
  const meta: Record<string, string | number | boolean> = {
    source: 'dify',
    node_type: String(n.node_type ?? n.type ?? ''),
  }
  const execMeta = (n.execution_metadata ?? {}) as AnyObj
  const nodeOut = (n.outputs ?? {}) as AnyObj
  const usage = (nodeOut.usage ?? {}) as AnyObj
  const tin = num(execMeta.total_tokens ?? n.tokens ?? usage.prompt_tokens)
  const tout = num(usage.completion_tokens)
  if (tin != null) meta.tokens_in = tin
  if (tout != null) meta.tokens_out = tout

  const ragChunks = parseKnowledge(n)

  return {
    id,
    parentId: parentId && parentId !== id ? parentId : undefined,
    name,
    kind,
    status,
    startMs: start,
    endMs: Math.max(start + 1, end),
    input,
    output,
    error,
    meta,
    ...(ragChunks ? { ragChunks } : {}),
  }
}

function mapKind(n: AnyObj): SpanKind {
  const t = String(n.node_type ?? n.type ?? '').toLowerCase()
  if (/llm|answer|question-classifier/.test(t)) return 'llm'
  if (/knowledge|retrieval|dataset|http-request/.test(t) && /knowledge|retrieval|dataset/.test(t)) {
    return 'retriever'
  }
  if (/knowledge|retrieval|dataset/.test(t)) return 'retriever'
  if (/tool|code|http|agent/.test(t)) return 'tool'
  if (/start|end|if-else|iteration|loop|variable|template/.test(t)) return 'chain'
  return 'custom'
}

function mapStatus(n: AnyObj): SpanStatus {
  const s = String(n.status ?? '').toLowerCase()
  if (s === 'failed' || s === 'error' || n.error) return 'error'
  if (s === 'running') return 'running'
  return 'ok'
}

function minElapsed(nodes: AnyObj[]): number {
  const nums = nodes
    .map((n) => Date.parse(String(n.created_at ?? n.start_at ?? '')))
    .filter((x) => Number.isFinite(x))
  return nums.length ? Math.min(...nums) : 0
}

function elapsedMs(v: unknown, t0: number, fallback: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) {
    if (v < 1e6) return Math.max(0, Math.round(v * 1000))
    return Math.max(0, Math.round(v - t0))
  }
  if (typeof v === 'string') {
    const p = Date.parse(v)
    if (Number.isFinite(p) && t0) return Math.max(0, Math.round(p - t0))
  }
  return fallback
}

function num(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function parseKnowledge(n: AnyObj): TraceSpan['ragChunks'] {
  const out = n.outputs ?? n.process_data
  if (!out || typeof out !== 'object') return undefined
  const o = out as AnyObj
  const docs = o.result ?? o.retriever_resources ?? o.documents ?? o.records
  if (!Array.isArray(docs)) return undefined
  const chunks = docs
    .map((d, i) => {
      if (!d || typeof d !== 'object') return null
      const x = d as AnyObj
      const segment = (x.segment ?? {}) as AnyObj
      const text = String(x.content ?? x.text ?? segment.content ?? '')
      if (!text) return null
      return {
        id: String(x.segment_id ?? x.id ?? `dify-doc-${i + 1}`),
        source: String(x.document_name ?? x.dataset_name ?? x.source ?? `doc-${i + 1}`),
        score: Number(x.score ?? x.relevance_score ?? 0) || 0,
        text,
      }
    })
    .filter(Boolean) as NonNullable<TraceSpan['ragChunks']>
  return chunks.length ? chunks : undefined
}
