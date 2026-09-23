import type { LlmConfig } from './config'

const PROXY_ROOT = `${import.meta.env.BASE_URL.replace(/\/?$/, '/')}llm-proxy`

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export type LlmUsage = { prompt_tokens?: number; completion_tokens?: number }

/**
 * 拼代理后的 chat completions 路径。
 * - DeepSeek / OpenAI：根域名 → /v1/chat/completions
 * - 火山方舟：…/api/v3 → /chat/completions（最终 …/api/v3/chat/completions）
 */
export function chatCompletionsProxyPath(baseUrl: string): string {
  try {
    const path = new URL(baseUrl).pathname.replace(/\/$/, '')
    if (/\/api\/v\d+$/i.test(path) || /\/v\d+$/i.test(path)) {
      return `${PROXY_ROOT}/chat/completions`
    }
  } catch {
    /* fall through */
  }
  return `${PROXY_ROOT}/v1/chat/completions`
}

function assertConfig(config: LlmConfig): string {
  const baseUrl = config.baseUrl.trim().replace(/\/$/, '').replace(/\/v1$/i, '')
  if (!baseUrl) {
    throw new Error(
      '请填写 API 地址，例如 https://api.deepseek.com 或方舟 https://ark.cn-beijing.volces.com/api/v3',
    )
  }
  if (!config.apiKey.trim()) {
    throw new Error('请填写 API Key（仅存本机浏览器，不会上传到本仓库）')
  }
  if (!config.model.trim()) {
    throw new Error('请填写 Model，例如 deepseek-chat 或 doubao-seed-2-1-pro-260628')
  }
  try {
    new URL(baseUrl)
  } catch {
    throw new Error('API 地址格式不正确，请填写完整 URL，如 https://api.openai.com')
  }
  return baseUrl
}

/** Extract usage from a streaming SSE JSON chunk (OpenAI-compatible). */
export function parseStreamUsageChunk(json: unknown): LlmUsage | undefined {
  if (!json || typeof json !== 'object') return undefined
  const obj = json as Record<string, unknown>
  const candidates = [obj.usage, obj.x_grok_usage, obj.x_usage]
  for (const c of candidates) {
    if (!c || typeof c !== 'object') continue
    const u = c as Record<string, unknown>
    const prompt = Number(u.prompt_tokens ?? u.input_tokens)
    const completion = Number(u.completion_tokens ?? u.output_tokens)
    const hasPrompt = Number.isFinite(prompt)
    const hasCompletion = Number.isFinite(completion)
    if (!hasPrompt && !hasCompletion) continue
    return {
      prompt_tokens: hasPrompt ? prompt : undefined,
      completion_tokens: hasCompletion ? completion : undefined,
    }
  }
  return undefined
}

export async function chatCompletion(
  config: LlmConfig,
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<{ text: string; usage?: LlmUsage }> {
  const baseUrl = assertConfig(config)

  const res = await fetch(chatCompletionsProxyPath(baseUrl), {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey.trim()}`,
      'X-OpenTrace-Target': baseUrl,
    },
    body: JSON.stringify({
      model: config.model.trim(),
      temperature: 0.3,
      messages,
    }),
  })

  const body = (await res.json().catch(() => ({}))) as {
    error?: { message?: string }
    choices?: { message?: { content?: string } }[]
    usage?: LlmUsage
  }

  if (!res.ok) {
    throw new Error(body.error?.message || `LLM HTTP ${res.status}`)
  }

  const text = body.choices?.[0]?.message?.content?.trim()
  if (!text) throw new Error('LLM 返回空内容')
  return { text, usage: body.usage }
}

async function streamOnce(
  config: LlmConfig,
  messages: ChatMessage[],
  onDelta: (delta: string) => void,
  signal: AbortSignal | undefined,
  includeUsage: boolean,
): Promise<{ text: string; usage?: LlmUsage }> {
  const baseUrl = assertConfig(config)

  const body: Record<string, unknown> = {
    model: config.model.trim(),
    temperature: 0.3,
    stream: true,
    messages,
  }
  if (includeUsage) {
    body.stream_options = { include_usage: true }
  }

  const res = await fetch(chatCompletionsProxyPath(baseUrl), {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      Authorization: `Bearer ${config.apiKey.trim()}`,
      'X-OpenTrace-Target': baseUrl,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
    throw new Error(errBody.error?.message || `LLM HTTP ${res.status}`)
  }

  if (!res.body) {
    throw new Error('无流式响应体，请用 pnpm dev 启动')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''
  let usage: LlmUsage | undefined

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n')
    buffer = parts.pop() || ''

    for (const line of parts) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (!data || data === '[DONE]') continue
      try {
        const json = JSON.parse(data) as {
          choices?: { delta?: { content?: string } }[]
        }
        const delta = json.choices?.[0]?.delta?.content
        if (delta) {
          full += delta
          onDelta(delta)
        }
        const parsed = parseStreamUsageChunk(json)
        if (parsed) usage = parsed
      } catch {
        // ignore partial JSON lines
      }
    }
  }

  if (!full.trim()) {
    throw new Error('流式返回为空')
  }
  return { text: full, usage }
}

/** Only retry without stream_options when the provider clearly rejects that option. */
export function isStreamOptionsRejectError(msg: string): boolean {
  return /stream_options|include_usage|unknown.?parameter.*stream|unsupported.?stream/i.test(
    msg,
  )
}

export async function chatCompletionStream(
  config: LlmConfig,
  messages: ChatMessage[],
  onDelta: (delta: string) => void,
  signal?: AbortSignal,
): Promise<{ text: string; usage?: LlmUsage }> {
  let emitted = false
  const trackedDelta = (delta: string) => {
    emitted = true
    onDelta(delta)
  }
  try {
    return await streamOnce(config, messages, trackedDelta, signal, true)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // Retry only if no tokens were streamed yet (avoid duplicated answer text).
    if (!emitted && isStreamOptionsRejectError(msg)) {
      return streamOnce(config, messages, onDelta, signal, false)
    }
    throw e
  }
}
