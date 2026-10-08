import type { TraceSession } from '../types'
import { buildRagSnapshot, type RagSnapshot } from './ragSnapshot'
import { computeSessionStats, type SessionStats } from './sessionStats'

export interface DatasetItem {
  id: string
  question: string
  expected?: string
  /** Match against loaded session id, or leave empty to match by question. */
  goldSessionId?: string
}

export interface EvalResult {
  datasetId: string
  sessionId: string | null
  question: string
  matched: boolean
  score: number
  grade: 'pass' | 'warn' | 'fail'
  reasons: string[]
  stats?: Pick<SessionStats, 'durationMs' | 'errorCount' | 'spanCount' | 'tokensIn' | 'tokensOut'>
  rag?: Pick<
    RagSnapshot,
    'chunkCount' | 'lowScoreChunks' | 'citedIds' | 'uncitedChunkIds' | 'answerHasCitation'
  >
  judge?: { score: number; rationale: string; model?: string }
}

const EXPECTED_OVERLAP = 0.25

export function parseDataset(text: string): DatasetItem[] {
  const t = text.trim()
  if (!t) return []
  if (t.startsWith('[')) {
    const arr = JSON.parse(t) as unknown
    if (!Array.isArray(arr)) throw new Error('Dataset JSON 需为数组')
    return arr.map(normalizeItem).filter(Boolean) as DatasetItem[]
  }
  const items: DatasetItem[] = []
  for (const line of t.split(/\r?\n/)) {
    const s = line.trim()
    if (!s) continue
    items.push(normalizeItem(JSON.parse(s))!)
  }
  return items.filter(Boolean)
}

function normalizeItem(raw: unknown): DatasetItem | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (typeof o.id !== 'string' || typeof o.question !== 'string') return null
  return {
    id: o.id,
    question: o.question,
    expected: typeof o.expected === 'string' ? o.expected : undefined,
    goldSessionId: typeof o.goldSessionId === 'string' ? o.goldSessionId : undefined,
  }
}

export function findSessionForItem(
  item: DatasetItem,
  sessions: TraceSession[],
): TraceSession | null {
  if (item.goldSessionId) {
    const byId = sessions.find((s) => s.id === item.goldSessionId)
    if (byId) return byId
  }
  const q = item.question.trim().toLowerCase()
  if (!q) return null
  return (
    sessions.find((s) => s.question.trim().toLowerCase() === q) ||
    sessions.find((s) => s.question.toLowerCase().includes(q) || q.includes(s.question.toLowerCase())) ||
    null
  )
}

/** Heuristic score 0–100. */
export function evaluateSessionAgainstItem(
  item: DatasetItem,
  session: TraceSession | null,
): EvalResult {
  if (!session) {
    return {
      datasetId: item.id,
      sessionId: null,
      question: item.question,
      matched: false,
      score: 0,
      grade: 'fail',
      reasons: ['未找到匹配会话'],
    }
  }

  const stats = computeSessionStats(session)
  const rag = buildRagSnapshot(session)
  const reasons: string[] = []
  let score = 100

  if (stats.errorCount > 0) {
    score -= Math.min(40, stats.errorCount * 15)
    reasons.push(`${stats.errorCount} 个 error span`)
  }
  if (rag.chunkCount > 0) {
    if (rag.lowScoreChunks.length) {
      score -= Math.min(20, rag.lowScoreChunks.length * 5)
      reasons.push(`${rag.lowScoreChunks.length} 个低分检索片段`)
    }
    if (!rag.answerHasCitation) {
      score -= 10
      reasons.push('答案无 [n] 引用')
    } else if (rag.uncitedChunkIds.length > rag.citedIds.length) {
      score -= 5
      reasons.push('未引用片段多于已引用')
    }
  }
  if (item.expected && session.answer) {
    const overlap = tokenOverlap(item.expected, session.answer)
    if (overlap < EXPECTED_OVERLAP) {
      score -= 25
      reasons.push(`与 expected 文本重叠偏低（${(overlap * 100).toFixed(0)}%）`)
    } else {
      reasons.push(`与 expected 重叠 ${(overlap * 100).toFixed(0)}%`)
    }
  }
  if (!reasons.length) reasons.push('启发式检查通过')

  score = Math.max(0, Math.min(100, Math.round(score)))
  const grade: EvalResult['grade'] = score >= 80 ? 'pass' : score >= 50 ? 'warn' : 'fail'

  return {
    datasetId: item.id,
    sessionId: session.id,
    question: item.question,
    matched: true,
    score,
    grade,
    reasons,
    stats: {
      durationMs: stats.durationMs,
      errorCount: stats.errorCount,
      spanCount: stats.spanCount,
      tokensIn: stats.tokensIn,
      tokensOut: stats.tokensOut,
    },
    rag: {
      chunkCount: rag.chunkCount,
      lowScoreChunks: rag.lowScoreChunks,
      citedIds: rag.citedIds,
      uncitedChunkIds: rag.uncitedChunkIds,
      answerHasCitation: rag.answerHasCitation,
    },
  }
}

export function evaluateDataset(
  items: DatasetItem[],
  sessions: TraceSession[],
): EvalResult[] {
  return items.map((item) =>
    evaluateSessionAgainstItem(item, findSessionForItem(item, sessions)),
  )
}

export function evalResultsToMarkdown(results: EvalResult[]): string {
  const lines = ['# OpenTrace 评测报告', '', `| id | session | score | grade | reasons |`, `|---|---|---|---|---|`]
  for (const r of results) {
    lines.push(
      `| ${r.datasetId} | ${r.sessionId ?? '—'} | ${r.score} | ${r.grade} | ${r.reasons.join('; ')} |`,
    )
  }
  lines.push('', `_Generated by OpenTrace Studio_`, '')
  return lines.join('\n')
}

export function evalResultsToCsv(results: EvalResult[]): string {
  const header = 'datasetId,sessionId,score,grade,reasons'
  const rows = results.map((r) =>
    [r.datasetId, r.sessionId ?? '', r.score, r.grade, JSON.stringify(r.reasons.join('; '))].join(
      ',',
    ),
  )
  return [header, ...rows].join('\n') + '\n'
}

function tokenOverlap(a: string, b: string): number {
  const ta = tokenize(a)
  const tb = new Set(tokenize(b))
  if (!ta.length) return 0
  let hit = 0
  for (const t of ta) if (tb.has(t)) hit += 1
  return hit / ta.length
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 1)
}
