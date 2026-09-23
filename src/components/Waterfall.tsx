import { useMemo } from 'react'
import { sessionDuration } from '../adapter/jsonl'
import { criticalPathDuration, findCriticalPath } from '../analytics/criticalPath'
import type { TraceSession, TraceSpan } from '../types'

interface Props {
  session: TraceSession
  selectedId: string | null
  onSelect: (id: string) => void
}

const KIND_COLOR: Record<string, string> = {
  llm: 'var(--llm)',
  tool: 'var(--tool)',
  retriever: 'var(--retriever)',
  chain: 'var(--chain)',
  custom: 'var(--muted)',
}

export function Waterfall({ session, selectedId, onSelect }: Props) {
  const total = sessionDuration(session) || 1
  const crit = useMemo(() => findCriticalPath(session.spans), [session.spans])
  const critMs = useMemo(
    () => criticalPathDuration(session.spans, crit),
    [session.spans, crit],
  )
  const rows = useMemo(
    () => [...session.spans].sort((a, b) => a.startMs - b.startMs || a.name.localeCompare(b.name)),
    [session.spans],
  )

  if (!rows.length) {
    return (
      <div className="panel-body">
        <p className="empty">暂无 span 可绘制瀑布图。</p>
      </div>
    )
  }

  const rowH = 22
  const labelW = 150
  const chartW = 520
  const height = rows.length * rowH + 28
  const width = labelW + chartW + 16

  return (
    <div className="panel-body waterfall-wrap">
      <p className="hint" style={{ marginTop: 0 }}>
        瀑布图 · 高亮为关键路径（{crit.size} spans · {critMs}ms）· 总时长 {total}ms
      </p>
      <svg
        className="waterfall-svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Span 瀑布图"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const x = labelW + t * chartW
          return (
            <g key={t}>
              <line x1={x} y1={18} x2={x} y2={height} className="wf-grid" />
              <text x={x} y={12} className="wf-axis" textAnchor="middle">
                {Math.round(total * t)}ms
              </text>
            </g>
          )
        })}
        {rows.map((span, i) => (
          <WaterfallRow
            key={span.id}
            span={span}
            y={22 + i * rowH}
            labelW={labelW}
            chartW={chartW}
            total={total}
            selected={selectedId === span.id}
            onCritical={crit.has(span.id)}
            onSelect={onSelect}
          />
        ))}
      </svg>
    </div>
  )
}

function WaterfallRow({
  span,
  y,
  labelW,
  chartW,
  total,
  selected,
  onCritical,
  onSelect,
}: {
  span: TraceSpan
  y: number
  labelW: number
  chartW: number
  total: number
  selected: boolean
  onCritical: boolean
  onSelect: (id: string) => void
}) {
  const x = labelW + (span.startMs / total) * chartW
  const w = Math.max(((span.endMs - span.startMs) / total) * chartW, 3)
  const fill = span.status === 'error' ? 'var(--danger)' : KIND_COLOR[span.kind] || KIND_COLOR.custom

  return (
    <g
      className={`wf-row ${selected ? 'selected' : ''} ${onCritical ? 'on-crit' : ''}`}
      onClick={() => onSelect(span.id)}
      style={{ cursor: 'pointer' }}
    >
      <text x={4} y={y + 14} className={`wf-label ${onCritical ? 'crit' : ''}`}>
        {onCritical ? '◆ ' : ''}
        {truncate(span.name, onCritical ? 16 : 18)}
      </text>
      <rect
        x={x}
        y={y + 4}
        width={w}
        height={14}
        rx={3}
        fill={fill}
        opacity={onCritical || selected ? 1 : 0.45}
        stroke={selected ? 'var(--accent)' : onCritical ? '#f0b429' : 'transparent'}
        strokeWidth={selected || onCritical ? 1.5 : 0}
      />
      <title>
        {span.name} · {span.kind} · {span.status} · {span.endMs - span.startMs}ms
        {onCritical ? ' · 关键路径' : ''}
      </title>
    </g>
  )
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}
