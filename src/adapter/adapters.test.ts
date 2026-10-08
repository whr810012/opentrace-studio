import { describe, expect, it } from 'vitest'
import { eventsToSessions, parseJsonl, sessionToJsonl } from '../adapter/jsonl'
import { sessionToCsv } from '../adapter/csvReport'
import { looksLikeOtlpJson, otlpJsonToSessions } from '../adapter/otlp-lite'
import { looksLikeLangGraph, langGraphToSessions } from '../adapter/langgraph'
import { looksLikeDify, difyToSessions } from '../adapter/dify'
import { parseImportedSessions } from '../adapter/importTrace'
import {
  findCriticalPath,
  nextCriticalPathSpanId,
  parentSpanId,
  firstChildSpanId,
} from '../analytics/criticalPath'
import type { TraceSession, TraceSpan } from '../types'

function span(partial: Partial<TraceSpan> & Pick<TraceSpan, 'id' | 'name'>): TraceSpan {
  return {
    kind: 'chain',
    status: 'ok',
    startMs: 0,
    endMs: 10,
    ...partial,
  }
}

describe('jsonl', () => {
  it('round-trips a session', () => {
    const session: TraceSession = {
      id: 's1',
      title: 't',
      startedAt: '2026-01-01T00:00:00.000Z',
      question: 'q',
      answer: 'a',
      spans: [
        span({ id: 'a', name: 'root', startMs: 0, endMs: 100 }),
        span({ id: 'b', name: 'child', parentId: 'a', startMs: 10, endMs: 40 }),
      ],
    }
    const text = sessionToJsonl(session)
    const events = parseJsonl(text)
    const sessions = eventsToSessions(events)
    expect(sessions).toHaveLength(1)
    expect(sessions[0].id).toBe('s1')
    expect(sessions[0].spans.map((s) => s.id)).toEqual(['a', 'b'])
  })

  it('skips comments and blank lines', () => {
    const text = `# comment\n\n${JSON.stringify({
      type: 'session',
      session: {
        id: 'x',
        title: 'x',
        startedAt: '2026-01-01T00:00:00.000Z',
        question: 'q',
      },
    })}\n`
    expect(eventsToSessions(parseJsonl(text))[0].id).toBe('x')
  })
})

describe('csv', () => {
  it('exports header and escaped error', () => {
    const session: TraceSession = {
      id: 's1',
      title: 't',
      startedAt: '2026-01-01T00:00:00.000Z',
      question: 'q',
      spans: [
        span({
          id: 'e1',
          name: 'tool.x',
          kind: 'tool',
          status: 'error',
          error: 'boom, "quoted"',
          startMs: 1,
          endMs: 5,
        }),
      ],
    }
    const csv = sessionToCsv(session)
    expect(csv.startsWith('id,parentId,name,')).toBe(true)
    expect(csv).toContain('boom, ""quoted""')
  })
})

describe('otlp-lite', () => {
  it('detects and converts resourceSpans', () => {
    const otlp = JSON.stringify({
      resourceSpans: [
        {
          scopeSpans: [
            {
              spans: [
                {
                  traceId: 'aa',
                  spanId: '01',
                  name: 'root',
                  startTimeUnixNano: '1000000000',
                  endTimeUnixNano: '2000000000',
                  status: { code: 1 },
                },
                {
                  traceId: 'aa',
                  spanId: '02',
                  parentSpanId: '01',
                  name: 'child',
                  startTimeUnixNano: '1100000000',
                  endTimeUnixNano: '1500000000',
                  status: { code: 2, message: 'fail' },
                },
              ],
            },
          ],
        },
      ],
    })
    expect(looksLikeOtlpJson(otlp)).toBe(true)
    const sessions = otlpJsonToSessions(otlp)
    expect(sessions).toHaveLength(1)
    expect(sessions[0].spans.length).toBe(2)
    expect(sessions[0].spans.some((s) => s.status === 'error')).toBe(true)
  })

  it('maps gen_ai usage and retrieval documents', () => {
    const docs = JSON.stringify([
      { id: 'd1', source: 'kb/a.md', score: 0.88, text: 'park' },
      { id: 'd2', source: 'kb/b.md', score: 0.4, text: 'rain' },
    ])
    const otlp = JSON.stringify({
      resourceSpans: [
        {
          scopeSpans: [
            {
              spans: [
                {
                  traceId: 'bb',
                  spanId: '11',
                  name: 'llm.answer',
                  startTimeUnixNano: '1000000000',
                  endTimeUnixNano: '2000000000',
                  status: { code: 1 },
                  attributes: [
                    { key: 'gen_ai.usage.input_tokens', value: { intValue: '100' } },
                    { key: 'gen_ai.usage.output_tokens', value: { intValue: '50' } },
                    { key: 'gen_ai.request.model', value: { stringValue: 'gpt-4o-mini' } },
                  ],
                },
                {
                  traceId: 'bb',
                  spanId: '22',
                  parentSpanId: '11',
                  name: 'retriever.kb',
                  startTimeUnixNano: '1100000000',
                  endTimeUnixNano: '1200000000',
                  status: { code: 1 },
                  attributes: [
                    { key: 'retrieval.documents', value: { stringValue: docs } },
                    { key: 'retrieval.query', value: { stringValue: 'park' } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    })
    const session = otlpJsonToSessions(otlp)[0]
    const llm = session.spans.find((s) => s.name === 'llm.answer')
    const rag = session.spans.find((s) => s.name === 'retriever.kb')
    expect(llm?.meta?.tokens_in).toBe(100)
    expect(llm?.meta?.tokens_out).toBe(50)
    expect(rag?.kind).toBe('retriever')
    expect(rag?.ragChunks).toHaveLength(2)
    expect(rag?.ragChunks?.[0].id).toBe('d1')
  })
})

describe('langgraph / dify adapters', () => {
  it('converts langgraph runs export', () => {
    const raw = JSON.stringify({
      trace_id: 't1',
      runs: [
        {
          id: 'r',
          name: 'agent',
          run_type: 'chain',
          start_time: '2026-01-01T00:00:00.000Z',
          end_time: '2026-01-01T00:00:01.000Z',
          inputs: { input: 'hello' },
        },
        {
          id: 'l',
          parent_run_id: 'r',
          name: 'llm',
          run_type: 'llm',
          start_time: '2026-01-01T00:00:00.200Z',
          end_time: '2026-01-01T00:00:00.900Z',
          outputs: { text: 'hi' },
          usage_metadata: { input_tokens: 3, output_tokens: 2 },
        },
      ],
    })
    expect(looksLikeLangGraph(raw)).toBe(true)
    const sessions = langGraphToSessions(raw)
    expect(sessions[0].spans.length).toBe(2)
    expect(sessions[0].spans.find((s) => s.kind === 'llm')?.meta?.tokens_in).toBe(3)
  })

  it('converts dify workflow export', () => {
    const raw = JSON.stringify({
      workflow_run_id: 'w1',
      query: 'q',
      answer: 'a',
      nodes: [
        {
          id: 'n1',
          node_type: 'llm',
          title: 'LLM',
          status: 'succeeded',
          created_at: '2026-01-01T00:00:00.000Z',
          elapsed_time: 0.5,
          outputs: { text: 'a' },
        },
      ],
    })
    expect(looksLikeDify(raw)).toBe(true)
    const sessions = difyToSessions(raw)
    expect(sessions[0].question).toBe('q')
    expect(sessions[0].spans[0].kind).toBe('llm')
  })

  it('routes via parseImportedSessions', () => {
    const dify = JSON.stringify({
      workflow_run_id: 'w2',
      query: 'x',
      nodes: [{ id: 'a', node_type: 'start', status: 'succeeded', created_at: '2026-01-01T00:00:00.000Z' }],
    })
    expect(parseImportedSessions(dify)[0].id).toContain('dify')
  })
})

describe('criticalPath', () => {
  const spans: TraceSpan[] = [
    span({ id: 'r', name: 'root', startMs: 0, endMs: 100 }),
    span({ id: 'a', name: 'fast', parentId: 'r', startMs: 0, endMs: 20 }),
    span({ id: 'b', name: 'slow', parentId: 'r', startMs: 0, endMs: 80 }),
    span({ id: 'c', name: 'leaf', parentId: 'b', startMs: 10, endMs: 70 }),
  ]

  it('picks the longest parent chain', () => {
    const path = findCriticalPath(spans)
    expect([...path].sort()).toEqual(['b', 'c', 'r'].sort())
  })

  it('walks critical path and tree', () => {
    expect(nextCriticalPathSpanId(spans, null)).toBe('r')
    expect(nextCriticalPathSpanId(spans, 'r')).toBe('b')
    expect(parentSpanId(spans, 'c')).toBe('b')
    expect(firstChildSpanId(spans, 'r')).toBe('a')
  })
})
