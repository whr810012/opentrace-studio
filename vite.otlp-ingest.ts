import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'

const MAX_BODY = 8 * 1024 * 1024
const BUFFER_CAP = 20

export type IngestBufferItem = {
  id: string
  receivedAt: string
  body: string
}

/** In-memory ring buffer of recent OTLP JSON payloads (dev/preview only). */
const buffer: IngestBufferItem[] = []

function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += buf.length
      if (size > limit) {
        reject(new Error(`body too large (max ${limit})`))
        req.destroy()
        return
      }
      chunks.push(buf)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function json(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(payload))
}

function matchIngest(url: string): 'push' | 'pull' | 'clear' | null {
  const path = url.split('?')[0] || ''
  if (
    path === '/opentrace/v1/traces' ||
    path === '/v1/traces' ||
    path === '/opentrace/otlp-ingest' ||
    path === '/otlp-ingest'
  ) {
    return 'push'
  }
  if (
    path === '/opentrace/otlp-ingest/buffer' ||
    path === '/otlp-ingest/buffer'
  ) {
    return 'pull'
  }
  if (
    path === '/opentrace/otlp-ingest/clear' ||
    path === '/otlp-ingest/clear'
  ) {
    return 'clear'
  }
  return null
}

/**
 * Thin local OTLP JSON ingest (not a Collector).
 * POST /v1/traces or /opentrace/v1/traces → buffer
 * GET  /otlp-ingest/buffer → drain for SPA
 */
export function otlpIngestPlugin(): Plugin {
  const handler = async (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
    const kind = matchIngest(req.url || '')
    if (!kind) {
      next()
      return
    }

    try {
      if (kind === 'push' && (req.method === 'POST' || req.method === 'PUT')) {
        const body = await readBody(req, MAX_BODY)
        const text = body.toString('utf8')
        if (!/"resourceSpans"\s*:/.test(text) && !/"scopeSpans"\s*:/.test(text)) {
          json(res, 400, { error: 'expected OTLP Traces JSON with resourceSpans' })
          return
        }
        const item: IngestBufferItem = {
          id: `ingest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          receivedAt: new Date().toISOString(),
          body: text,
        }
        buffer.unshift(item)
        while (buffer.length > BUFFER_CAP) buffer.pop()
        json(res, 200, { ok: true, id: item.id, buffered: buffer.length })
        return
      }

      if (kind === 'pull' && req.method === 'GET') {
        const drain = req.url?.includes('drain=1')
        const items = buffer.map(({ id, receivedAt, body }) => ({ id, receivedAt, body }))
        if (drain) buffer.length = 0
        json(res, 200, { items, count: items.length })
        return
      }

      if (kind === 'clear' && (req.method === 'POST' || req.method === 'DELETE')) {
        buffer.length = 0
        json(res, 200, { ok: true })
        return
      }

      json(res, 405, { error: 'method not allowed' })
    } catch (e) {
      json(res, 400, { error: e instanceof Error ? e.message : 'ingest failed' })
    }
  }

  return {
    name: 'opentrace-otlp-ingest',
    configureServer(server) {
      server.middlewares.use(handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler)
    },
  }
}
