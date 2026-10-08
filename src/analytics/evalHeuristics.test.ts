import { describe, expect, it } from 'vitest'
import type { TraceSession } from '../types'
import {
  evaluateDataset,
  evaluateSessionAgainstItem,
  parseDataset,
} from './evalHeuristics'

const session: TraceSession = {
  id: 's1',
  title: 'demo',
  startedAt: '2026-01-01T00:00:00.000Z',
  question: '附近有什么场馆？',
  answer: '推荐 A 馆 [1]',
  spans: [
    {
      id: 'r1',
      name: 'retriever',
      kind: 'retriever',
      status: 'ok',
      startMs: 0,
      endMs: 20,
      ragChunks: [
        { id: 'c1', source: 'kb', score: 0.9, text: 'A 馆' },
        { id: 'c2', source: 'kb', score: 0.2, text: '低分' },
      ],
    },
    {
      id: 'l1',
      name: 'llm',
      kind: 'llm',
      status: 'ok',
      startMs: 20,
      endMs: 100,
      meta: { tokens_in: 10, tokens_out: 20 },
    },
  ],
}

describe('evalHeuristics', () => {
  it('parses JSONL dataset', () => {
    const items = parseDataset(
      `${JSON.stringify({ id: 'd1', question: '附近有什么场馆？', expected: '场馆' })}\n`,
    )
    expect(items).toHaveLength(1)
    expect(items[0].id).toBe('d1')
  })

  it('scores a matching session', () => {
    const r = evaluateSessionAgainstItem(
      { id: 'd1', question: '附近有什么场馆？', expected: '场馆 A' },
      session,
    )
    expect(r.matched).toBe(true)
    expect(r.score).toBeGreaterThan(50)
    expect(r.sessionId).toBe('s1')
  })

  it('fails when no session', () => {
    const r = evaluateDataset([{ id: 'x', question: 'nope' }], [session])
    expect(r[0].grade).toBe('fail')
    expect(r[0].matched).toBe(false)
  })
})
