export interface LlmConfig {
  baseUrl: string
  apiKey: string
  model: string
}

const STORAGE_KEY = 'opentrace.llmConfig'
const KEY_SESSION = 'opentrace.llmKey.session'

export const defaultLlmConfig = (): LlmConfig => ({
  baseUrl: 'https://api.deepseek.com',
  apiKey: '',
  model: 'deepseek-chat',
})

function normalizeLoaded(config: LlmConfig): LlmConfig {
  let baseUrl = config.baseUrl.trim()
  if (!baseUrl || baseUrl === '/llm-proxy' || baseUrl.startsWith('/llm-proxy')) {
    baseUrl = defaultLlmConfig().baseUrl
  }
  baseUrl = baseUrl.replace(/\/$/, '').replace(/\/v1$/i, '')
  return {
    baseUrl,
    apiKey: config.apiKey,
    model: config.model.trim() || defaultLlmConfig().model,
  }
}

function readSessionKey(): string {
  try {
    return sessionStorage.getItem(KEY_SESSION) ?? ''
  } catch {
    return ''
  }
}

export function loadLlmConfig(): LlmConfig {
  const base = defaultLlmConfig()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return { ...base, apiKey: readSessionKey() }
    }
    const parsed = JSON.parse(raw) as Partial<LlmConfig>
    const persisted = normalizeLoaded({ ...base, ...parsed, apiKey: '' })
    const sessionKey = readSessionKey()
    const legacyKey =
      typeof parsed.apiKey === 'string' && parsed.apiKey.trim() ? parsed.apiKey : ''
    return { ...persisted, apiKey: sessionKey || legacyKey }
  } catch {
    return base
  }
}

/** Move legacy apiKey out of localStorage into sessionStorage. Call once at startup. */
export function migrateLlmConfigStorage(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as Partial<LlmConfig>
    const base = defaultLlmConfig()
    const persisted = normalizeLoaded({ ...base, ...parsed, apiKey: '' })
    const legacyKey =
      typeof parsed.apiKey === 'string' && parsed.apiKey.trim() ? parsed.apiKey : ''
    if (legacyKey) {
      try {
        if (!sessionStorage.getItem(KEY_SESSION)) {
          sessionStorage.setItem(KEY_SESSION, legacyKey)
        }
      } catch {
        /* private mode */
      }
    }
    if (legacyKey || 'apiKey' in parsed) {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ baseUrl: persisted.baseUrl, model: persisted.model, apiKey: '' }),
      )
    }
  } catch {
    /* ignore */
  }
}

export function saveLlmConfig(config: LlmConfig): boolean {
  const normalized = normalizeLoaded(config)
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ baseUrl: normalized.baseUrl, model: normalized.model, apiKey: '' }),
    )
  } catch {
    return false
  }
  try {
    if (normalized.apiKey.trim()) {
      sessionStorage.setItem(KEY_SESSION, normalized.apiKey)
    } else {
      sessionStorage.removeItem(KEY_SESSION)
    }
  } catch {
    // private mode / quota — key did not persist
    return false
  }
  return true
}
