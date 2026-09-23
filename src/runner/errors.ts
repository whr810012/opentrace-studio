export function friendlyError(err: unknown): string {
  if (!err) return '未知错误'
  if (typeof err === 'object' && err !== null && 'name' in err && (err as Error).name === 'AbortError') {
    return '已停止本次运行。'
  }
  const msg = err instanceof Error ? err.message : String(err)
  return diagnoseMessage(msg)
}

export function diagnoseSpanError(raw: string | undefined): {
  category: string
  hint: string
} | null {
  if (!raw?.trim()) return null
  const lower = raw.toLowerCase()

  if (/abort|已停止/i.test(raw)) {
    return { category: '用户中止', hint: '运行已手动停止，已完成步骤仍保留在时间线。' }
  }
  if (/401|unauthorized|authentication|invalid.*key|incorrect api key/i.test(lower)) {
    return { category: '密钥无效', hint: '检查 API Key 是否完整，以及是否对应当前厂商。' }
  }
  if (/403|forbidden/i.test(lower)) {
    return { category: '权限不足', hint: '账号可能未开通该模型，可换一个 Model。' }
  }
  if (/404|not found/i.test(lower)) {
    return { category: '地址错误', hint: '检查 API 根地址；不要带 /v1。' }
  }
  if (/429|rate limit/i.test(lower)) {
    return { category: '限流 / 额度', hint: '稍后再试，或检查账户余额与速率限制。' }
  }
  if (/cors/i.test(lower)) {
    return { category: '跨域', hint: '请走本地 /llm-proxy，不要让浏览器直连上游。' }
  }
  if (/timeout|timed out|aborted/i.test(lower)) {
    return { category: '超时', hint: '上游过慢或网络不稳，可重试。' }
  }
  if (/502|代理上游|failed to fetch|networkerror|econnrefused|enotfound|network/i.test(lower)) {
    return { category: '网络 / 代理', hint: '确认 npm run dev 已启动，且本机能访问该 API。' }
  }
  if (/未收录|geocode|地址/i.test(raw)) {
    return {
      category: '工具未命中',
      hint: '演示地理表仅含静安寺 / 徐家汇 / 陆家嘴等地点。',
    }
  }
  if (/open-meteo|http \d+/i.test(lower)) {
    return { category: '外部工具失败', hint: '天气 API 暂不可用；可继续看已有证据。' }
  }

  return { category: '步骤失败', hint: diagnoseMessage(raw) }
}

function diagnoseMessage(msg: string): string {
  const lower = msg.toLowerCase()

  if (/请填写 api key|api key/i.test(msg) && /填写|missing|empty/i.test(msg)) {
    return '请先填写 API Key。'
  }
  if (/请填写 api 地址|地址无效|invalid url|地址格式/i.test(msg)) {
    return 'API 地址无效，例如 https://api.deepseek.com（不要加 /v1）。'
  }
  if (/请填写 model/i.test(msg)) {
    return '请填写 Model，或点 DeepSeek / OpenAI 预设。'
  }
  if (/401|unauthorized|authentication|invalid.*key|incorrect api key/i.test(lower)) {
    return '密钥无效或无权限（401）。'
  }
  if (/403|forbidden/i.test(lower)) {
    return '被拒绝访问（403），可换 Model 或检查账号开通情况。'
  }
  if (/404|not found/i.test(lower)) {
    return '接口地址可能不对（404），根地址不要带 /v1。'
  }
  if (/429|rate limit/i.test(lower)) {
    return '请求过频或额度不足（429）。'
  }
  if (/502|代理上游|failed to fetch|networkerror|econnrefused|enotfound/i.test(lower)) {
    return '连不上模型服务，检查代理与网络。'
  }
  if (/cors/i.test(lower)) {
    return '跨域被拦截，请使用本地 /llm-proxy。'
  }
  return msg
}
