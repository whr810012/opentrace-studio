import { useEffect, useMemo, useState } from 'react'
import { diffSessionsByName, sessionDuration } from '../adapter/jsonl'
import { computeSessionStats } from '../analytics/sessionStats'
import type { TraceSession } from '../types'
import { IconChevronUp, IconGitCompare } from './UiIcons'

interface Props {
  sessions: TraceSession[]
  activeId: string | null
  forcePair?: { a: string; b: string } | null
  onForcePairConsumed?: () => void
}

export function RunDiff({ sessions, activeId, forcePair, onForcePairConsumed }: Props) {
  const [open, setOpen] = useState(false)
  const [idA, setIdA] = useState<string>('')
  const [idB, setIdB] = useState<string>('')

  useEffect(() => {
    if (!forcePair) return
    setIdA(forcePair.a)
    setIdB(forcePair.b)
    setOpen(true)
    onForcePairConsumed?.()
  }, [forcePair, onForcePairConsumed])

  const sessionA = sessions.find((s) => s.id === idA) ?? null
  const sessionB = sessions.find((s) => s.id === idB) ?? null

  const statsA = useMemo(
    () => (sessionA ? computeSessionStats(sessionA) : null),
    [sessionA],
  )
  const statsB = useMemo(
    () => (sessionB ? computeSessionStats(sessionB) : null),
    [sessionB],
  )

  const rows = useMemo(() => {
    if (!sessionA || !sessionB) return []
    return diffSessionsByName(sessionA, sessionB)
  }, [sessionA, sessionB])

  const pickDefaults = () => {
    if (sessions.length < 2) return
    const a = activeId && sessions.some((s) => s.id === activeId) ? activeId : sessions[0].id
    const b = sessions.find((s) => s.id !== a)?.id ?? sessions[1]?.id
    if (a) setIdA(a)
    if (b) setIdB(b)
    setOpen(true)
  }

  return (
    <section className="panel diff-panel">
      <div className="panel-hd">
        <h2>Run Diff</h2>
        <div className="diff-hd-actions">
          {!open ? (
            <button
              type="button"
              className="btn"
              disabled={sessions.length < 2}
              onClick={pickDefaults}
              title={sessions.length < 2 ? '至少需要两次运行' : '对比两次会话'}
            >
              <IconGitCompare />
              对比两次 Run
            </button>
          ) : (
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              <IconChevronUp />
              收起
            </button>
          )}
        </div>
      </div>
      {open && (
        <div className="panel-body">
          <div className="diff-pickers">
            <label>
              A {sessionA?.model ? `· ${sessionA.model}` : ''}
              <select value={idA} onChange={(e) => setIdA(e.target.value)}>
                <option value="">选择会话…</option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              B {sessionB?.model ? `· ${sessionB.model}` : ''}
              <select value={idB} onChange={(e) => setIdB(e.target.value)}>
                <option value="">选择会话…</option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {sessionA && sessionB && idA === idB ? (
            <p className="hint">请选择两个不同的会话再对比。</p>
          ) : null}

          {sessionA && sessionB && idA !== idB ? (
            <>
              <div className="diff-summary">
                <div>
                  <span className="label">模型</span>
                  <p>
                    A <code>{sessionA.model || '—'}</code> · B <code>{sessionB.model || '—'}</code>
                  </p>
                </div>
                <div>
                  <span className="label">总耗时</span>
                  <p>
                    A {sessionDuration(sessionA)}ms → B {sessionDuration(sessionB)}ms
                    <span
                      className={deltaClass(sessionDuration(sessionB) - sessionDuration(sessionA))}
                    >
                      {' '}
                      ({fmtDelta(sessionDuration(sessionB) - sessionDuration(sessionA))}ms)
                    </span>
                  </p>
                </div>
                <div>
                  <span className="label">Tokens / 估成本</span>
                  <p>
                    A {statsA ? `${statsA.tokensIn}/${statsA.tokensOut}` : '—'} ·{' '}
                    {statsA ? fmtUsd(statsA.estCostUsd) : '—'}
                    {' → '}
                    B {statsB ? `${statsB.tokensIn}/${statsB.tokensOut}` : '—'} ·{' '}
                    {statsB ? fmtUsd(statsB.estCostUsd) : '—'}
                    {statsA && statsB && (
                      <span className={deltaClass(statsB.estCostUsd - statsA.estCostUsd)}>
                        {' '}
                        ({fmtUsdDelta(statsB.estCostUsd - statsA.estCostUsd)})
                      </span>
                    )}
                  </p>
                </div>
                <div>
                  <span className="label">答案摘要</span>
                  <p className="diff-answer">
                    <strong>A:</strong> {clip(sessionA.answer)}
                  </p>
                  <p className="diff-answer">
                    <strong>B:</strong> {clip(sessionB.answer)}
                  </p>
                </div>
              </div>

              <table className="diff-table">
                <thead>
                  <tr>
                    <th>span.name</th>
                    <th>A 状态 / 耗时</th>
                    <th>B 状态 / 耗时</th>
                    <th>Δms</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr
                      key={`${r.name}-${i}`}
                      className={r.statusChanged || !r.a || !r.b ? 'diff-row-hl' : undefined}
                    >
                      <td className="mono">{r.name}</td>
                      <td>
                        {r.a ? (
                          <>
                            <span className={`badge ${r.a.status}`}>{r.a.status}</span>{' '}
                            {r.a.endMs - r.a.startMs}ms
                          </>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>
                        {r.b ? (
                          <>
                            <span className={`badge ${r.b.status}`}>{r.b.status}</span>{' '}
                            {r.b.endMs - r.b.startMs}ms
                          </>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td className={deltaClass(r.durationDeltaMs)}>
                        {r.durationDeltaMs === null ? '—' : fmtDelta(r.durationDeltaMs)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <p className="empty">请选择两个不同会话进行对比。</p>
          )}
        </div>
      )}
    </section>
  )
}

function fmtUsd(n: number) {
  if (n <= 0) return '$0'
  if (n < 0.0001) return '<$0.0001'
  if (n < 0.01) return `$${n.toFixed(4)}`
  return `$${n.toFixed(3)}`
}

function fmtUsdDelta(n: number) {
  const sign = n > 0 ? '+' : ''
  if (Math.abs(n) < 0.0001) return '$0'
  if (Math.abs(n) < 0.01) return `${sign}$${n.toFixed(4)}`
  return `${sign}$${n.toFixed(3)}`
}

function clip(text: string | undefined) {
  if (!text) return '（无答案）'
  return text.length > 120 ? `${text.slice(0, 120)}…` : text
}

function fmtDelta(n: number) {
  if (n > 0) return `+${n}`
  return String(n)
}

function deltaClass(n: number | null) {
  if (n === null || n === 0) return 'delta-zero'
  return n > 0 ? 'delta-up' : 'delta-down'
}
