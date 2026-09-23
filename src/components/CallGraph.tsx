import { useMemo } from 'react'
import type { TraceSession, TraceSpan } from '../types'

interface Props {
  session: TraceSession
  selectedId: string | null
  replayIndex: number | null
  onSelect: (id: string) => void
}

interface LayoutNode {
  span: TraceSpan
  x: number
  y: number
  depth: number
}

export function CallGraph({ session, selectedId, replayIndex, onSelect }: Props) {
  const { nodes, edges, width, height } = useMemo(
    () => layoutGraph(session.spans),
    [session.spans],
  )

  const visibleIds = useMemo(() => {
    if (replayIndex === null) return null
    const ordered = [...session.spans].sort((a, b) => a.startMs - b.startMs)
    const cutoff = ordered[Math.min(replayIndex, ordered.length - 1)]?.endMs ?? Infinity
    return new Set(ordered.filter((s) => s.endMs <= cutoff).map((s) => s.id))
  }, [session.spans, replayIndex])

  return (
    <div className="graph-wrap">
      <svg className="graph-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="工具调用图">
        {edges.map((e) => {
          const from = nodes.find((n) => n.span.id === e.from)
          const to = nodes.find((n) => n.span.id === e.to)
          if (!from || !to) return null
          const path = `M ${from.x + 70} ${from.y + 28} C ${from.x + 70} ${from.y + 70}, ${to.x + 70} ${to.y - 20}, ${to.x + 70} ${to.y}`
          return <path key={`${e.from}-${e.to}`} className="edge" d={path} />
        })}
        {nodes.map((n) => {
          const dimmed = visibleIds !== null && !visibleIds.has(n.span.id)
          return (
            <g
              key={n.span.id}
              className={`node-card ${selectedId === n.span.id ? 'selected' : ''} ${dimmed ? 'dimmed' : ''} ${n.span.status === 'error' ? 'has-error' : ''}`}
              transform={`translate(${n.x}, ${n.y})`}
              onClick={() => onSelect(n.span.id)}
            >
              <rect className="node-rect" width="140" height="44" />
              <text className="node-title" x="10" y="18">
                {truncate(n.span.name, 18)}
              </text>
              <text className="node-sub" x="10" y="34">
                {n.span.status === 'error' ? 'error' : n.span.kind} ·{' '}
                {n.span.endMs - n.span.startMs}ms
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function layoutGraph(spans: TraceSpan[]) {
  const byParent = new Map<string | undefined, TraceSpan[]>()
  for (const span of spans) {
    const key = span.parentId
    const list = byParent.get(key) ?? []
    list.push(span)
    byParent.set(key, list)
  }

  const nodes: LayoutNode[] = []
  const edges: { from: string; to: string }[] = []
  const colWidth = 170
  const rowHeight = 70

  function subtreeWidth(span: TraceSpan): number {
    const children = byParent.get(span.id) ?? []
    if (!children.length) return 1
    return children.reduce((sum, c) => sum + subtreeWidth(c), 0)
  }

  function walk(span: TraceSpan, depth: number, colStart: number) {
    const width = subtreeWidth(span)
    nodes.push({
      span,
      depth,
      x: 20 + (colStart + (width - 1) / 2) * colWidth,
      y: 20 + depth * rowHeight,
    })
    if (span.parentId) edges.push({ from: span.parentId, to: span.id })
    const children = byParent.get(span.id) ?? []
    let col = colStart
    for (const child of children) {
      const w = subtreeWidth(child)
      walk(child, depth + 1, col)
      col += w
    }
  }

  const roots = byParent.get(undefined) ?? spans.filter((s) => !s.parentId)
  let col = 0
  for (const root of roots) {
    const w = subtreeWidth(root)
    walk(root, 0, col)
    col += w
  }

  // parents missing → treat as roots to the right of laid-out trees
  let orphanCol = col
  for (const span of spans) {
    if (!nodes.some((n) => n.span.id === span.id)) {
      const w = subtreeWidth(span)
      walk(span, 0, orphanCol)
      orphanCol += w
    }
  }

  const width = Math.max(480, ...nodes.map((n) => n.x + 160))
  const height = Math.max(200, ...nodes.map((n) => n.y + 70))
  return { nodes, edges, width, height }
}

function truncate(text: string, n: number) {
  return text.length > n ? `${text.slice(0, n - 1)}…` : text
}
