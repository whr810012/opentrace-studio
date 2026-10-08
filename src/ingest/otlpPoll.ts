import { parseImportedSessions } from '../adapter/importTrace'
import type { TraceSession } from '../types'

const BUFFER_URL = `${import.meta.env.BASE_URL.replace(/\/?$/, '/')}otlp-ingest/buffer`

export async function pollOtlpIngestBuffer(opts?: {
  drain?: boolean
}): Promise<TraceSession[]> {
  const url = `${BUFFER_URL}?drain=${opts?.drain === false ? '0' : '1'}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`OTLP ingest buffer HTTP ${res.status}`)
  }
  const data = (await res.json()) as {
    items?: { id: string; receivedAt: string; body: string }[]
  }
  const sessions: TraceSession[] = []
  for (const item of data.items ?? []) {
    try {
      const parsed = parseImportedSessions(item.body)
      for (const s of parsed) {
        sessions.push({
          ...s,
          meta: { ...(s.meta ?? {}), ingest: true, ingest_id: item.id },
        })
      }
    } catch {
      /* skip bad payload */
    }
  }
  return sessions
}
