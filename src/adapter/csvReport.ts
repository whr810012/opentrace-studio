import type { TraceSession } from '../types'

function csvEscape(value: string | number): string {
  const s = String(value)
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function sessionToCsv(session: TraceSession): string {
  const header = [
    'id',
    'parentId',
    'name',
    'kind',
    'status',
    'startMs',
    'endMs',
    'durationMs',
    'error',
  ]
  const rows = [...session.spans]
    .sort((a, b) => a.startMs - b.startMs)
    .map((s) =>
      [
        s.id,
        s.parentId ?? '',
        s.name,
        s.kind,
        s.status,
        s.startMs,
        s.endMs,
        Math.max(0, s.endMs - s.startMs),
        s.error ?? '',
      ]
        .map(csvEscape)
        .join(','),
    )
  return `${header.join(',')}\n${rows.join('\n')}\n`
}
