import { describe, expect, it } from 'vitest'
import { chatCompletionsProxyPath } from './llm'

describe('chatCompletionsProxyPath', () => {
  it('uses /v1 for OpenAI-style root hosts', () => {
    expect(chatCompletionsProxyPath('https://api.deepseek.com')).toMatch(
      /llm-proxy\/v1\/chat\/completions$/,
    )
    expect(chatCompletionsProxyPath('https://api.openai.com')).toMatch(
      /llm-proxy\/v1\/chat\/completions$/,
    )
  })

  it('omits /v1 when base already has /api/v3 (Volcengine Ark)', () => {
    expect(chatCompletionsProxyPath('https://ark.cn-beijing.volces.com/api/v3')).toMatch(
      /llm-proxy\/chat\/completions$/,
    )
  })
})
