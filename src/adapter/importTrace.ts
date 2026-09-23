import { eventsToSessions, parseJsonl } from './jsonl'
import { looksLikeOtlpJson, otlpJsonToSessions } from './otlp-lite'
import type { TraceSession } from '../types'

export function parseImportedSessions(text: string): TraceSession[] {
  if (looksLikeOtlpJson(text)) return otlpJsonToSessions(text)
  return eventsToSessions(parseJsonl(text))
}
