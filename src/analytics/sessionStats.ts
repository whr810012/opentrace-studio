import { sessionDuration } from '../adapter/jsonl'
import type { SpanKind, TraceSession } from '../types'

export interface SessionStats {
  durationMs: number
  spanCount: number
  errorCount: number
  okCount: number
  tokensIn: number
  tokensOut: number
  estCostUsd: number
  byKind: Partial<Record<SpanKind, { count: number; durationMs: number }>>
  slowest: { id: string; name: string; durationMs: number } | null
  slowThresholdMs: number
}

const RATE_PER_M: Record<string, { in: number; out: number }> = {
  'deepseek-chat': { in: 0.28, out: 0.42 },
  'deepseek-reasoner': { in: 0.55, out: 2.19 },
  'gpt-4o-mini': { in: 0.15, out: 0.6 },
  'gpt-4o': { in: 2.5, out: 10 },
  'gpt-4.1-mini': { in: 0.4, out: 1.6 },
  default: { in: 0.5, out: 1.5 },
}

export function estimateCostUsd(
  model: string | undefined,
  tokensIn: number,
  tokensOut: number,
): number {
  const key = (model || '').toLowerCase()
  const rate =
    Object.entries(RATE_PER_M).find(([k]) => k !== 'default' && key.includes(k))?.[1] ??
    RATE_PER_M.default
  return (tokensIn / 1e6) * rate.in + (tokensOut / 1e6) * rate.out
}

export function computeSessionStats(session: TraceSession): SessionStats {
  const durationMs = sessionDuration(session)
  let errorCount = 0
  let okCount = 0
  let tokensIn = 0
  let tokensOut = 0
  const byKind: SessionStats['byKind'] = {}
  let slowest: SessionStats['slowest'] = null

  const durations: number[] = []

  for (const span of session.spans) {
    const d = Math.max(0, span.endMs - span.startMs)
    durations.push(d)
    if (span.status === 'error') errorCount += 1
    if (span.status === 'ok') okCount += 1

    const bucket = byKind[span.kind] ?? { count: 0, durationMs: 0 }
    bucket.count += 1
    bucket.durationMs += d
    byKind[span.kind] = bucket

    const tin = Number(span.meta?.tokens_in ?? 0)
    const tout = Number(span.meta?.tokens_out ?? 0)
    if (Number.isFinite(tin)) tokensIn += tin
    if (Number.isFinite(tout)) tokensOut += tout

    if (!slowest || d > slowest.durationMs) {
      slowest = { id: span.id, name: span.name, durationMs: d }
    }
  }

  const sorted = [...durations].sort((a, b) => a - b)
  const p75 = sorted.length
    ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.75))]
    : 0
  const slowThresholdMs = Math.max(p75, Math.round(durationMs * 0.25), 50)

  return {
    durationMs,
    spanCount: session.spans.length,
    errorCount,
    okCount,
    tokensIn,
    tokensOut,
    estCostUsd: estimateCostUsd(session.model, tokensIn, tokensOut),
    byKind,
    slowest,
    slowThresholdMs,
  }
}

export function findFirstErrorSpanId(session: TraceSession): string | null {
  const ordered = [...session.spans].sort((a, b) => a.startMs - b.startMs)
  return ordered.find((s) => s.status === 'error')?.id ?? null
}

export function resolveCitation(
  session: TraceSession,
  index1Based: number,
): { spanId: string; chunkId: string } | null {
  if (index1Based < 1) return null
  const retrievers = [...session.spans]
    .filter((s) => (s.ragChunks?.length ?? 0) > 0)
    .sort((a, b) => a.startMs - b.startMs)
  const host = retrievers[0]
  if (!host?.ragChunks?.length) return null
  const chunk = host.ragChunks[index1Based - 1]
  if (!chunk) return null
  return { spanId: host.id, chunkId: chunk.id }
}
