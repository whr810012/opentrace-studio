import type { Plugin } from 'vite'
import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import https from 'node:https'
import dns from 'node:dns/promises'
import net from 'node:net'

const HEADER = 'x-opentrace-target'
const MAX_PROXY_BODY_BYTES = 2 * 1024 * 1024

/** Normalize IP literals (expand/compress IPv6 via URL parser). */
export function normalizeIpLiteral(ip: string): string {
  const raw = ip.trim().toLowerCase().split('%')[0]
  if (net.isIPv4(raw)) return raw
  if (net.isIPv6(raw)) {
    try {
      return new URL(`http://[${raw}]/`).hostname.replace(/^\[|\]$/g, '').toLowerCase()
    } catch {
      return raw
    }
  }
  return raw
}

function hexPairToV4(hi: string, lo: string): string | null {
  const h = Number.parseInt(hi, 16)
  const l = Number.parseInt(lo, 16)
  if (!Number.isFinite(h) || !Number.isFinite(l)) return null
  return `${(h >> 8) & 255}.${h & 255}.${(l >> 8) & 255}.${l & 255}`
}

/**
 * Extract embedded IPv4 from IPv4-mapped (::ffff:…) or deprecated
 * IPv4-compatible (::a.b.c.d / ::7f00:1) forms. Handles expanded spellings
 * via normalizeIpLiteral first.
 */
export function embeddedIpv4(ip: string): string | null {
  const n = normalizeIpLiteral(ip)
  if (net.isIPv4(n)) return n

  let m = n.match(/^::ffff:((?:\d{1,3}\.){3}\d{1,3})$/)
  if (m && net.isIPv4(m[1])) return m[1]
  m = n.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (m) return hexPairToV4(m[1], m[2])

  // IPv4-compatible (deprecated but still routable to IPv4 stack on many hosts)
  m = n.match(/^::((?:\d{1,3}\.){3}\d{1,3})$/)
  if (m && net.isIPv4(m[1])) return m[1]
  m = n.match(/^::([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (m) return hexPairToV4(m[1], m[2])

  // NAT64 well-known prefix 64:ff9b::/96 (last 32 bits = IPv4)
  m = n.match(/^64:ff9b::((?:\d{1,3}\.){3}\d{1,3})$/)
  if (m && net.isIPv4(m[1])) return m[1]
  m = n.match(/^64:ff9b::([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (m) return hexPairToV4(m[1], m[2])
  m = n.match(/^64:ff9b::([0-9a-f]{1,4})$/)
  if (m) return hexPairToV4('0', m[1])

  return null
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

export function isPrivateOrLocalIp(ip: string): boolean {
  const n = normalizeIpLiteral(ip)

  if (net.isIPv4(n)) return isPrivateV4(n)

  if (net.isIPv6(n)) {
    if (n === '::' || n === '::1') return true
    // ULA fc00::/7, link-local fe80::/10
    if (n.startsWith('fc') || n.startsWith('fd')) return true
    if (n.startsWith('fe8') || n.startsWith('fe9') || n.startsWith('fea') || n.startsWith('feb')) {
      return true
    }
    // NAT64 well-known prefix — never a legitimate LLM API host; fail closed
    if (n.startsWith('64:ff9b:')) return true

    const v4 = embeddedIpv4(n)
    if (v4) return isPrivateV4(v4)

    // Unparseable IPv4-mapped (::ffff:…) — fail closed
    if (n.startsWith('::ffff:')) return true
    return false
  }
  return false
}

export interface SafeUpstream {
  url: URL
  connectIp: string
}

function assertBlockedHostname(host: string) {
  const blocked =
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host === '0.0.0.0' ||
    host === 'metadata.google.internal'
  if (blocked) {
    throw new Error('禁止代理到本机或内网主机名')
  }
}

export async function resolveSafeUpstream(targetBase: string): Promise<SafeUpstream> {
  let url: URL
  try {
    url = new URL(targetBase.trim())
  } catch {
    throw new Error('API 地址无效，请填写如 https://api.deepseek.com')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('仅支持 http/https')
  }
  if (url.username || url.password) {
    throw new Error('API 地址不得包含用户名/密码')
  }

  const host = url.hostname.replace(/^\[|\]$/g, '')
  assertBlockedHostname(host)

  let connectIp: string
  if (net.isIP(host)) {
    if (isPrivateOrLocalIp(host)) {
      throw new Error('禁止代理到内网 / 本机 IP')
    }
    connectIp = host
  } else {
    const records = await dns.lookup(host, { all: true, verbatim: true })
    if (!records.length) throw new Error('无法解析上游主机')
    if (records.some((r) => isPrivateOrLocalIp(r.address))) {
      throw new Error('禁止代理到解析含内网地址的主机')
    }
    connectIp = records[0].address
  }

  return { url, connectIp }
}

function jsonError(res: ServerResponse, status: number, message: string) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({ error: { message } }))
}

function requestPinned(
  safe: SafeUpstream,
  path: string,
  method: string,
  headers: Record<string, string>,
  body: Buffer | undefined,
): Promise<IncomingMessage> {
  const isHttps = safe.url.protocol === 'https:'
  const port = safe.url.port ? Number(safe.url.port) : isHttps ? 443 : 80
  const lib = isHttps ? https : http
  const hostHeader = safe.url.host

  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        hostname: safe.connectIp,
        port,
        path,
        method,
        headers: {
          ...headers,
          Host: hostHeader,
        },
        servername: isHttps ? safe.url.hostname.replace(/^\[|\]$/g, '') : undefined,
        timeout: 120_000,
      },
      (upstreamRes) => resolve(upstreamRes),
    )
    req.on('timeout', () => {
      req.destroy(new Error('上游请求超时'))
    })
    req.on('error', reject)
    if (body && body.length) req.write(body)
    req.end()
  })
}

function stripLlmProxyPrefix(url: string): string | null {
  const pathOnly = url.split('?')[0] || ''
  for (const prefix of ['/opentrace/llm-proxy', '/llm-proxy']) {
    if (pathOnly === prefix || pathOnly.startsWith(`${prefix}/`)) {
      const rest = pathOnly.slice(prefix.length) || '/'
      const qs = url.includes('?') ? url.slice(url.indexOf('?')) : ''
      return `${rest.startsWith('/') ? rest : `/${rest}`}${qs}`
    }
  }
  return null
}

/** Dev/preview proxy: /opentrace/llm-proxy 或 /llm-proxy，上游来自 X-OpenTrace-Target. */
export function llmProxyPlugin(): Plugin {
  const handler = async (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
    const url = req.url || ''
    const upstreamPathRaw = stripLlmProxyPrefix(url)
    if (upstreamPathRaw === null) {
      next()
      return
    }

    const rawTarget = req.headers[HEADER]
    const targetBase = Array.isArray(rawTarget) ? rawTarget[0] : rawTarget
    if (!targetBase?.trim()) {
      jsonError(res, 400, '缺少 API 地址（X-OpenTrace-Target）')
      return
    }

    let safe: SafeUpstream
    try {
      safe = await resolveSafeUpstream(targetBase)
    } catch (e) {
      jsonError(
        res,
        400,
        e instanceof Error ? e.message : 'API 地址无效，请填写如 https://api.deepseek.com',
      )
      return
    }

    const chunks: Buffer[] = []
    let bodySize = 0
    for await (const chunk of req) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      bodySize += buf.length
      if (bodySize > MAX_PROXY_BODY_BYTES) {
        jsonError(res, 413, `请求体过大（上限 ${MAX_PROXY_BODY_BYTES} 字节）`)
        req.destroy()
        return
      }
      chunks.push(buf)
    }
    const body = Buffer.concat(chunks)
    const upstreamPath = upstreamPathRaw.split('?')[0] || '/'
    const basePath = safe.url.pathname.replace(/\/$/, '')
    const fullPath =
      (basePath && !upstreamPath.startsWith(basePath)
        ? `${basePath}${upstreamPath}`
        : upstreamPath) + (safe.url.search || '')

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept:
          typeof req.headers.accept === 'string'
            ? req.headers.accept
            : 'application/json, text/event-stream',
      }
      if (req.headers.authorization) {
        headers.Authorization = String(req.headers.authorization)
      }

      const upstream = await requestPinned(
        safe,
        fullPath.startsWith('/') ? fullPath : `/${fullPath}`,
        req.method || 'POST',
        headers,
        req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
      )

      res.statusCode = upstream.statusCode || 502
      const contentType = upstream.headers['content-type'] || 'application/json'
      res.setHeader('Content-Type', Array.isArray(contentType) ? contentType[0] : contentType)
      const cacheControl = upstream.headers['cache-control']
      if (cacheControl) {
        res.setHeader('Cache-Control', Array.isArray(cacheControl) ? cacheControl[0] : cacheControl)
      }

      upstream.on('error', () => {
        try {
          res.destroy()
        } catch {
          /* ignore */
        }
      })
      upstream.pipe(res)
    } catch (e) {
      if (res.headersSent) {
        try {
          res.destroy()
        } catch {
          /* ignore */
        }
        return
      }
      jsonError(res, 502, e instanceof Error ? e.message : '代理上游失败')
    }
  }

  return {
    name: 'opentrace-llm-proxy',
    configureServer(server) {
      server.middlewares.use(handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler)
    },
  }
}
