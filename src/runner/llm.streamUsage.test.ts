import { describe, expect, it } from 'vitest'
import { isStreamOptionsRejectError, parseStreamUsageChunk } from './llm'

describe('parseStreamUsageChunk', () => {
  it('reads standard usage object', () => {
    expect(
      parseStreamUsageChunk({
        usage: { prompt_tokens: 12, completion_tokens: 34 },
      }),
    ).toEqual({ prompt_tokens: 12, completion_tokens: 34 })
  })

  it('reads nested usage-like fields', () => {
    expect(
      parseStreamUsageChunk({
        x_grok_usage: { prompt_tokens: 1, completion_tokens: 2 },
      }),
    ).toEqual({ prompt_tokens: 1, completion_tokens: 2 })
  })

  it('returns undefined when missing', () => {
    expect(parseStreamUsageChunk({ choices: [] })).toBeUndefined()
    expect(parseStreamUsageChunk(null)).toBeUndefined()
  })
})

describe('isStreamOptionsRejectError', () => {
  it('matches stream_options related messages only', () => {
    expect(isStreamOptionsRejectError("Unknown parameter: 'stream_options'")).toBe(true)
    expect(isStreamOptionsRejectError('include_usage is not supported')).toBe(true)
    expect(isStreamOptionsRejectError('LLM HTTP 400')).toBe(false)
    expect(isStreamOptionsRejectError('invalid api key')).toBe(false)
  })
})
