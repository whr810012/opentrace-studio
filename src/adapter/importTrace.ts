import { eventsToSessions, parseJsonl } from './jsonl'
import { looksLikeOtlpJson, otlpJsonToSessions } from './otlp-lite'
import { looksLikeLangGraph, langGraphToSessions } from './langgraph'
import { looksLikeDify, difyToSessions } from './dify'
import type { TraceSession } from '../types'

export function parseImportedSessions(text: string): TraceSession[] {
  if (looksLikeOtlpJson(text)) return otlpJsonToSessions(text)
  if (looksLikeDify(text)) return difyToSessions(text)
  if (looksLikeLangGraph(text)) return langGraphToSessions(text)
  return eventsToSessions(parseJsonl(text))
}
