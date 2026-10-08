import { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { sessionDuration } from '../adapter/jsonl'
import { computeSessionStats } from '../analytics/sessionStats'
import { getSpanRenderer } from '../plugins/spanRenderers'
import type { TraceSession, TraceSpan, SpanKind, SpanStatus } from '../types'
import {
  IconAlert,
  IconCheck,
  IconFilter,
  IconLoader,
  IconPin,
} from './UiIcons'

const KIND_LABEL: Record<SpanKind, string> = {
  llm: 'LLM',
  tool: 'TOOL',
  retriever: 'RAG',
  chain: 'CHAIN',
  custom: 'CUSTOM',
}

type StatusFilter = 'all' | SpanStatus

const STATUS_ICON = {
  all: IconFilter,
  ok: IconCheck,
  error: IconAlert,
  running: IconLoader,
} as const

const ROW_ESTIMATE = 56

interface Props {
  session: TraceSession
  selectedId: string | null
  replayIndex: number | null
  kindFilter: Set<SpanKind>
  pinnedIds?: Set<string>
  onSelect: (id: string) => void
  onToggleKind: (kind: SpanKind) => void
  onTogglePin?: (id: string) => void
}

export function Timeline({
  session,
  selectedId,
  replayIndex,
  kindFilter,
  pinnedIds,
  onSelect,
  onToggleKind,
  onTogglePin,
}: Props) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const parentRef = useRef<HTMLDivElement>(null)
  const total = sessionDuration(session) || 1
  const stats = useMemo(() => computeSessionStats(session), [session])
  const ordered = useMemo(
    () => [...session.spans].sort((a, b) => a.startMs - b.startMs),
    [session.spans],
  )

  const kinds = useMemo(
    () => Array.from(new Set(session.spans.map((s) => s.kind))),
    [session.spans],
  )

  const errorCount = useMemo(
    () => session.spans.reduce((n, s) => n + (s.status === 'error' ? 1 : 0), 0),
    [session.spans],
  )
  const q = query.trim().toLowerCase()

  const visible = useMemo(() => {
    return session.spans.filter((s) => {
      if (!kindFilter.has(s.kind)) return false
      if (statusFilter !== 'all' && s.status !== statusFilter) return false
      if (q && !`${s.name} ${s.kind} ${s.error ?? ''}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [session.spans, kindFilter, statusFilter, q])

  const virtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_ESTIMATE,
    overscan: 12,
  })

  useEffect(() => {
    if (!selectedId) return
    const index = visible.findIndex((s) => s.id === selectedId)
    if (index >= 0) virtualizer.scrollToIndex(index, { align: 'auto' })
  }, [selectedId, visible, virtualizer])

  const replayCutoff =
    replayIndex === null
      ? null
      : ordered[Math.min(replayIndex, Math.max(0, ordered.length - 1))]?.endMs

  return (
    <div className="panel-body">
      <div className="timeline-tools">
        <input
          id="timeline-search"
          className="timeline-search"
          type="search"
          placeholder="搜索 span 名称…（快捷键 /）"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="status-filters">
          {(['all', 'ok', 'error', 'running'] as const).map((s) => {
            const StatusIcon = STATUS_ICON[s]
            return (
              <button
                key={s}
                type="button"
                className={`chip ${statusFilter === s ? 'on' : ''} ${s === 'error' ? 'chip-danger' : ''}`}
                onClick={() => setStatusFilter(s)}
              >
                <StatusIcon />
                {s === 'all' ? '全部状态' : s}
              </button>
            )
          })}
        </div>
      </div>
      <div className="filters">
        {kinds.map((kind) => (
          <button
            key={kind}
            type="button"
            className={`chip ${kindFilter.has(kind) ? 'on' : ''}`}
            onClick={() => onToggleKind(kind)}
          >
            <IconFilter />
            {KIND_LABEL[kind]}
          </button>
        ))}
        {errorCount > 0 && (
          <span className="chip chip-danger" title="点选红色 span 可在右侧查看失败诊断">
            {errorCount} 失败
          </span>
        )}
        <span className="chip" title={`慢 span 阈值 ≥ ${stats.slowThresholdMs}ms`}>
          慢 ≥ {stats.slowThresholdMs}ms
        </span>
        <span className="chip" title="虚拟列表">
          {visible.length.toLocaleString()} / {session.spans.length.toLocaleString()}
        </span>
      </div>
      <div className="timeline timeline-virtual" ref={parentRef}>
        {!visible.length ? (
          <p className="empty">当前筛选下无 span。</p>
        ) : (
          <div
            className="timeline-virtual-inner"
            style={{ height: `${virtualizer.getTotalSize()}px` }}
          >
            {virtualizer.getVirtualItems().map((row) => {
              const span = visible[row.index]!
              const dur = span.endMs - span.startMs
              return (
                <div
                  key={span.id}
                  className="timeline-virtual-row"
                  style={{
                    height: `${row.size}px`,
                    transform: `translateY(${row.start}px)`,
                  }}
                >
                  <SpanRow
                    span={span}
                    total={total}
                    selected={selectedId === span.id}
                    dimmed={replayCutoff !== null && span.endMs > replayCutoff}
                    slow={dur >= stats.slowThresholdMs && span.status !== 'error'}
                    pinned={pinnedIds?.has(span.id) ?? false}
                    onSelect={onSelect}
                    onTogglePin={onTogglePin}
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function SpanRow({
  span,
  total,
  selected,
  dimmed,
  slow,
  pinned,
  onSelect,
  onTogglePin,
}: {
  span: TraceSpan
  total: number
  selected: boolean
  dimmed: boolean
  slow: boolean
  pinned: boolean
  onSelect: (id: string) => void
  onTogglePin?: (id: string) => void
}) {
  const left = (span.startMs / total) * 100
  const width = Math.max(((span.endMs - span.startMs) / total) * 100, 2)
  const isError = span.status === 'error'

  return (
    <div
      className={`span-row ${selected ? 'selected' : ''} ${dimmed ? 'dimmed' : ''} ${isError ? 'has-error' : ''} ${slow ? 'is-slow' : ''} ${pinned ? 'is-pinned' : ''}`}
      data-span-id={span.id}
      onClick={() => onSelect(span.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect(span.id)
      }}
    >
      <div className="span-time">
        {span.startMs}–{span.endMs}ms
      </div>
      <div className="span-main">
        <strong>
          {pinned ? (
            <span className="pin-mark" title="已钉选">
              <IconPin />{' '}
            </span>
          ) : null}
          {span.name}
          {slow ? <span className="slow-tag">慢</span> : null}
        </strong>
        <div className="bar-track">
          <div
            className={`bar-fill ${isError ? 'kind-error' : `kind-${span.kind}`}`}
            style={{ marginLeft: `${left}%`, width: `${width}%` }}
          />
        </div>
      </div>
      <div className="span-trailing">
        {getSpanRenderer(span).renderTimelineChip?.(span)}
        {onTogglePin && (
          <button
            type="button"
            className={`btn btn-tiny btn-icon ${pinned ? 'on-pin' : ''}`}
            title={pinned ? '取消钉选' : '钉选（快捷键 p）'}
            aria-label={pinned ? '取消钉选' : '钉选'}
            onClick={(e) => {
              e.stopPropagation()
              onTogglePin(span.id)
            }}
          >
            <IconPin />
          </button>
        )}
        <span className={`badge ${span.status}`}>{span.status}</span>
      </div>
    </div>
  )
}
