import type { LlmConfig } from '../runner/config'
import { chatCompletion } from '../runner/llm'
import type { TraceSession } from '../types'
import type { DatasetItem, EvalResult } from './evalHeuristics'

export async function runLlmJudge(
  item: DatasetItem,
  session: TraceSession,
  config: LlmConfig,
  signal?: AbortSignal,
): Promise<{ score: number; rationale: string; model?: string }> {
  const answer = (session.answer || '').slice(0, 2000)
  const expected = (item.expected || '').slice(0, 1000)
  const prompt = [
    'You are an evaluation judge for an Agent/RAG answer.',
    'Score from 0 to 100. Reply with JSON only: {"score":number,"rationale":string}',
    `Question: ${item.question}`,
    expected ? `Expected (optional): ${expected}` : '',
    `Answer: ${answer || '(empty)'}`,
  ]
    .filter(Boolean)
    .join('\n')

  const { text } = await chatCompletion(
    config,
    [
      { role: 'system', content: 'Return compact JSON only.' },
      { role: 'user', content: prompt },
    ],
    signal,
  )

  const parsed = extractJson(text)
  const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)))
  const rationale = String(parsed.rationale || text).slice(0, 500)
  return { score, rationale, model: config.model }
}

export function mergeJudgeIntoResult(
  base: EvalResult,
  judge: { score: number; rationale: string; model?: string },
): EvalResult {
  const blended = Math.round(base.score * 0.5 + judge.score * 0.5)
  const grade: EvalResult['grade'] = blended >= 80 ? 'pass' : blended >= 50 ? 'warn' : 'fail'
  return {
    ...base,
    score: blended,
    grade,
    reasons: [...base.reasons, `LLM judge ${judge.score}: ${judge.rationale}`],
    judge,
  }
}

function extractJson(text: string): Record<string, unknown> {
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return { score: 0, rationale: text.slice(0, 200) }
  try {
    return JSON.parse(m[0]) as Record<string, unknown>
  } catch {
    return { score: 0, rationale: text.slice(0, 200) }
  }
}
