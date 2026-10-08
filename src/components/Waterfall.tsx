import { useMemo, useRef, useState } from 'react'
import { sessionDuration } from '../adapter/jsonl'
import { criticalPathDuration, findCriticalPath } from '../analytics/criticalPath'
import { resolveSpanColor } from '../plugins/spanRenderers'
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

const ROW_H = 22
const VIEWPORT_H = 360

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
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)

  if (!rows.length) {
    return (
      <div className="panel-body">
        <p className="empty">暂无 span 可绘制瀑布图。</p>
      </div>
    )
  }

  const labelW = 150
  const chartW = 520
  const width = labelW + chartW + 16
  const fullHeight = rows.length * ROW_H + 28
  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - 4)
  const visibleCount = Math.ceil(VIEWPORT_H / ROW_H) + 8
  const end = Math.min(rows.length, start + visibleCount)
  const slice = rows.slice(start, end)

  return (
    <div className="panel-body waterfall-wrap">
      <p className="hint" style={{ marginTop: 0 }}>
        瀑布图 · 高亮为关键路径（{crit.size} spans · {critMs}ms）· 总时长 {total}ms ·{' '}
        {rows.length.toLocaleString()} rows
      </p>
      <div
        className="waterfall-scroll"
        ref={scrollerRef}
        style={{ height: Math.min(VIEWPORT_H, fullHeight), overflow: 'auto' }}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      >
        <svg
          className="waterfall-svg"
          width={width}
          height={fullHeight}
          viewBox={`0 0 ${width} ${fullHeight}`}
          role="img"
          aria-label="Span 瀑布图"
        >
          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const x = labelW + t * chartW
            return (
              <g key={t}>
                <line x1={x} y1={18} x2={x} y2={fullHeight} className="wf-grid" />
                <text x={x} y={12} className="wf-axis" textAnchor="middle">
                  {Math.round(total * t)}ms
                </text>
              </g>
            )
          })}
          {slice.map((span, i) => (
            <WaterfallRow
              key={span.id}
              span={span}
              y={22 + (start + i) * ROW_H}
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
  const fill =
    span.status === 'error' ? 'var(--danger)' : resolveSpanColor(span, KIND_COLOR)

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
