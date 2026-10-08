import { describe, expect, it } from 'vitest'
import type { TraceSpan } from '../types'
import {
  ensureDefaultSpanRenderers,
  getSpanRenderer,
  registerSpanRenderer,
  resolveSpanColor,
} from './spanRenderers'

function span(partial: Partial<TraceSpan> & Pick<TraceSpan, 'id' | 'name' | 'kind'>): TraceSpan {
  return {
    status: 'ok',
    startMs: 0,
    endMs: 10,
    ...partial,
  }
}

describe('spanRenderers', () => {
  it('returns llm default renderer', () => {
    ensureDefaultSpanRenderers()
    const r = getSpanRenderer(span({ id: '1', name: 'llm', kind: 'llm' }))
    expect(r.renderDetail).toBeTypeOf('function')
    expect(r.color).toBe('var(--llm)')
  })

  it('resolves custom renderHint over kind', () => {
    registerSpanRenderer('my-tool', {
      color: '#abc',
      renderDetail: () => null,
    })
    const r = getSpanRenderer(
      span({
        id: '2',
        name: 'x',
        kind: 'custom',
        meta: { renderHint: 'my-tool' },
      }),
    )
    expect(r.color).toBe('#abc')
  })

  it('resolveSpanColor falls back to map', () => {
    const c = resolveSpanColor(span({ id: '3', name: 't', kind: 'tool' }), {
      tool: 'var(--tool)',
    })
    expect(c).toBe('var(--tool)')
  })
})
