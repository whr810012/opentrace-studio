/// <reference types="@cloudflare/workers-types" />

/**
 * 生产环境 Live Run 代理：浏览器 → /opentrace/llm-proxy/* → 上游 LLM API
 * 密钥仅经请求头转发，不落盘；禁止内网 / 本机目标。
 */

const HEADER = 'x-opentrace-target'
const MAX_BODY = 2 * 1024 * 1024

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function isPrivateV4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number)
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a >= 224) return true
  return false
}

function assertSafeTarget(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new Error('API 地址无效，请填写如 https://api.deepseek.com')
  }
  if (url.protocol !== 'https:') {
    throw new Error('生产环境仅支持 https 上游')
  }
  if (url.username || url.password) {
    throw new Error('API 地址不得包含用户名/密码')
  }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host === '0.0.0.0' ||
    host === 'metadata.google.internal' ||
    host === '::1'
  ) {
    throw new Error('禁止代理到本机或内网主机名')
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) && isPrivateV4(host)) {
    throw new Error('禁止代理到内网 / 本机 IP')
  }
  return url
}

export async function handleLlmProxy(
  request: Request,
  params: { path?: string | string[] },
): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-OpenTrace-Target, Accept',
      },
    })
  }

  if (request.method !== 'POST') {
    return jsonError(405, 'Method Not Allowed')
  }

  const targetBase = request.headers.get(HEADER)
  if (!targetBase?.trim()) {
    return jsonError(400, '缺少 API 地址（X-OpenTrace-Target）')
  }

  let safe: URL
  try {
    safe = assertSafeTarget(targetBase)
  } catch (e) {
    return jsonError(400, e instanceof Error ? e.message : 'API 地址无效')
  }

  const splat = params.path
  const pathParts = Array.isArray(splat) ? splat : splat ? [splat] : []
  const upstreamPath = `/${pathParts.join('/')}`
  const basePath = safe.pathname.replace(/\/$/, '')
  const fullPath =
    basePath && !upstreamPath.startsWith(basePath)
      ? `${basePath}${upstreamPath}`
      : upstreamPath

  const body = await request.arrayBuffer()
  if (body.byteLength > MAX_BODY) {
    return jsonError(413, `请求体过大（上限 ${MAX_BODY} 字节）`)
  }

  const headers: Record<string, string> = {
    'Content-Type': request.headers.get('Content-Type') || 'application/json',
    Accept: request.headers.get('Accept') || 'application/json, text/event-stream',
  }
  const auth = request.headers.get('Authorization')
  if (auth) headers.Authorization = auth

  try {
    const upstream = await fetch(`${safe.origin}${fullPath}${safe.search}`, {
      method: 'POST',
      headers,
      body,
    })
    const outHeaders = new Headers()
    const ct = upstream.headers.get('Content-Type')
    if (ct) outHeaders.set('Content-Type', ct)
    const cc = upstream.headers.get('Cache-Control')
    if (cc) outHeaders.set('Cache-Control', cc)
    return new Response(upstream.body, { status: upstream.status, headers: outHeaders })
  } catch (e) {
    return jsonError(502, e instanceof Error ? e.message : '代理上游失败')
  }
}
