import { useMemo, useState } from 'react'
import { findCriticalPath } from '../analytics/criticalPath'
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
  collapsedChildren: number
}

const DEFAULT_MAX_DEPTH = 2

export function CallGraph({ session, selectedId, replayIndex, onSelect }: Props) {
  const [maxDepth, setMaxDepth] = useState(DEFAULT_MAX_DEPTH)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const crit = useMemo(() => findCriticalPath(session.spans), [session.spans])

  const { nodes, edges, width, height } = useMemo(
    () => layoutGraph(session.spans, maxDepth, expanded, selectedId, crit),
    [session.spans, maxDepth, expanded, selectedId, crit],
  )

  const visibleIds = useMemo(() => {
    if (replayIndex === null) return null
    const ordered = [...session.spans].sort((a, b) => a.startMs - b.startMs)
    const cutoff = ordered[Math.min(replayIndex, ordered.length - 1)]?.endMs ?? Infinity
    return new Set(ordered.filter((s) => s.endMs <= cutoff).map((s) => s.id))
  }, [session.spans, replayIndex])

  return (
    <div className="graph-wrap">
      <div className="graph-toolbar">
        <label className="hint">
          展开深度{' '}
          <select
            value={maxDepth}
            onChange={(e) => setMaxDepth(Number(e.target.value))}
            aria-label="调用图展开深度"
          >
            {[1, 2, 3, 4, 6, 99].map((d) => (
              <option key={d} value={d}>
                {d === 99 ? '全部' : d}
              </option>
            ))}
          </select>
        </label>
        <span className="hint">
          显示 {nodes.length.toLocaleString()} / {session.spans.length.toLocaleString()} · 关键路径高亮
        </span>
      </div>
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
          const onCrit = crit.has(n.span.id)
          return (
            <g
              key={n.span.id}
              className={`node-card ${selectedId === n.span.id ? 'selected' : ''} ${dimmed ? 'dimmed' : ''} ${n.span.status === 'error' ? 'has-error' : ''} ${onCrit ? 'on-crit' : ''}`}
              transform={`translate(${n.x}, ${n.y})`}
              onClick={() => {
                onSelect(n.span.id)
                if (n.collapsedChildren > 0) {
                  setExpanded((prev) => {
                    const next = new Set(prev)
                    if (next.has(n.span.id)) next.delete(n.span.id)
                    else next.add(n.span.id)
                    return next
                  })
                }
              }}
            >
              <rect className="node-rect" width="140" height="44" />
              <text className="node-title" x="10" y="18">
                {onCrit ? '◆ ' : ''}
                {truncate(n.span.name, 16)}
              </text>
              <text className="node-sub" x="10" y="34">
                {n.span.status === 'error' ? 'error' : n.span.kind} ·{' '}
                {n.span.endMs - n.span.startMs}ms
                {n.collapsedChildren > 0 ? ` · +${n.collapsedChildren}` : ''}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function layoutGraph(
  spans: TraceSpan[],
  maxDepth: number,
  expanded: Set<string>,
  selectedId: string | null,
  crit: Set<string>,
) {
  const byParent = new Map<string | undefined, TraceSpan[]>()
  for (const span of spans) {
    const key = span.parentId
    const list = byParent.get(key) ?? []
    list.push(span)
    byParent.set(key, list)
  }

  const keep = new Set<string>()
  function markKeep(span: TraceSpan, depth: number) {
    keep.add(span.id)
    const children = byParent.get(span.id) ?? []
    const force =
      expanded.has(span.id) ||
      span.id === selectedId ||
      crit.has(span.id) ||
      children.some((c) => c.id === selectedId || crit.has(c.id))
    if (depth >= maxDepth && !force) return
    for (const child of children) markKeep(child, depth + 1)
  }

  const roots = byParent.get(undefined) ?? spans.filter((s) => !s.parentId)
  for (const root of roots) markKeep(root, 0)

  // ancestors of selected / critical always kept
  const byId = new Map(spans.map((s) => [s.id, s]))
  const ensureAncestors = (id: string | null | undefined) => {
    let cur = id ? byId.get(id) : undefined
    while (cur) {
      keep.add(cur.id)
      cur = cur.parentId ? byId.get(cur.parentId) : undefined
    }
  }
  ensureAncestors(selectedId)
  for (const id of crit) ensureAncestors(id)

  const nodes: LayoutNode[] = []
  const edges: { from: string; to: string }[] = []
  const colWidth = 170
  const rowHeight = 70

  function visibleChildren(span: TraceSpan): TraceSpan[] {
    return (byParent.get(span.id) ?? []).filter((c) => keep.has(c.id))
  }

  function subtreeWidth(span: TraceSpan): number {
    const children = visibleChildren(span)
    if (!children.length) return 1
    return children.reduce((sum, c) => sum + subtreeWidth(c), 0)
  }

  function walk(span: TraceSpan, depth: number, colStart: number) {
    const width = subtreeWidth(span)
    const allChildren = byParent.get(span.id) ?? []
    const shown = visibleChildren(span)
    nodes.push({
      span,
      depth,
      x: 20 + (colStart + (width - 1) / 2) * colWidth,
      y: 20 + depth * rowHeight,
      collapsedChildren: Math.max(0, allChildren.length - shown.length),
    })
    if (span.parentId && keep.has(span.parentId)) edges.push({ from: span.parentId, to: span.id })
    let col = colStart
    for (const child of shown) {
      const w = subtreeWidth(child)
      walk(child, depth + 1, col)
      col += w
    }
  }

  let col = 0
  for (const root of roots) {
    if (!keep.has(root.id)) continue
    const w = subtreeWidth(root)
    walk(root, 0, col)
    col += w
  }

  let orphanCol = col
  for (const span of spans) {
    if (keep.has(span.id) && !nodes.some((n) => n.span.id === span.id)) {
      const w = subtreeWidth(span)
      walk(span, 0, orphanCol)
      orphanCol += w
    }
  }

  const width = Math.max(480, ...nodes.map((n) => n.x + 160), 480)
  const height = Math.max(200, ...nodes.map((n) => n.y + 70), 200)
  return { nodes, edges, width, height }
}

function truncate(text: string, n: number) {
  return text.length > n ? `${text.slice(0, n - 1)}…` : text
}
