import { computeSessionStats } from '../analytics/sessionStats'
import type { TraceSession } from '../types'
import { IconAlert, IconZap } from './UiIcons'

interface Props {
  session: TraceSession
  onJumpError?: () => void
  onJumpSlowest?: () => void
}

const KIND_ORDER = ['llm', 'tool', 'retriever', 'chain', 'custom'] as const

function fmtUsd(n: number) {
  if (n <= 0) return '$0'
  if (n < 0.0001) return '<$0.0001'
  if (n < 0.01) return `$${n.toFixed(4)}`
  return `$${n.toFixed(3)}`
}

export function SessionStats({ session, onJumpError, onJumpSlowest }: Props) {
  const stats = computeSessionStats(session)

  return (
    <div className="stats-bar">
      <div className="stat">
        <span className="stat-label">总耗时</span>
        <strong>{stats.durationMs}ms</strong>
      </div>
      <div className="stat">
        <span className="stat-label">Spans</span>
        <strong>{stats.spanCount}</strong>
      </div>
      <div className="stat">
        <span className="stat-label">错误</span>
        <strong className={stats.errorCount ? 'stat-danger' : undefined}>{stats.errorCount}</strong>
        {stats.errorCount > 0 && onJumpError && (
          <button type="button" className="btn btn-tiny" onClick={onJumpError}>
            <IconAlert />
            跳转
          </button>
        )}
      </div>
      <div className="stat">
        <span className="stat-label">Tokens</span>
        <strong>
          {stats.tokensIn}/{stats.tokensOut}
        </strong>
        {stats.tokensIn + stats.tokensOut === 0 &&
          session.spans.some((s) => s.kind === 'llm') && (
            <span className="stat-hint" title="部分上游流式不返回 usage；规划步骤或非流式兜底通常有值">
              上游未返回 usage
            </span>
          )}
      </div>
      <div className="stat" title="公开价目粗估，仅作相对对比">
        <span className="stat-label">估成本</span>
        <strong>{fmtUsd(stats.estCostUsd)}</strong>
      </div>
      <div className="stat kind-bars">
        <span className="stat-label">按 kind</span>
        <div className="kind-stack">
          {KIND_ORDER.map((k) => {
            const v = stats.byKind[k]
            if (!v || !stats.durationMs) return null
            const pct = Math.max(4, (v.durationMs / stats.durationMs) * 100)
            return (
              <span
                key={k}
                className={`kind-seg kind-${k}`}
                style={{ width: `${pct}%` }}
                title={`${k}: ${v.count} · ${v.durationMs}ms`}
              />
            )
          })}
        </div>
      </div>
      {stats.slowest && (
        <div className="stat">
          <span className="stat-label">最慢</span>
          <button type="button" className="btn-link" onClick={onJumpSlowest}>
            <IconZap />
            {stats.slowest.name} · {stats.slowest.durationMs}ms
          </button>
        </div>
      )}
    </div>
  )
}
