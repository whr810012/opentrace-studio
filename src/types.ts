/** OpenTrace JSONL event types. */

export type SpanKind = 'llm' | 'tool' | 'retriever' | 'chain' | 'custom'
export type SpanStatus = 'ok' | 'error' | 'running'

export interface RagChunk {
  id: string
  source: string
  score: number
  text: string
  url?: string
}

export interface TraceSpan {
  id: string
  parentId?: string
  name: string
  kind: SpanKind
  status: SpanStatus
  startMs: number
  endMs: number
  input?: unknown
  output?: unknown
  error?: string
  ragChunks?: RagChunk[]
  meta?: Record<string, string | number | boolean>
}

export interface TraceSession {
  id: string
  title: string
  startedAt: string
  question: string
  answer?: string
  model?: string
  note?: string
  pinnedSpanIds?: string[]
  spans: TraceSpan[]
  /** Optional session-level meta (eval scores, ingest source, …). */
  meta?: Record<string, string | number | boolean>
}

export interface TraceEvent {
  type: 'session' | 'span'
  session?: Omit<TraceSession, 'spans'>
  span?: TraceSpan & { sessionId: string }
}
