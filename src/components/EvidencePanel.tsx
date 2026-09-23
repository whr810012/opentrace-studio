import { useEffect, useRef } from 'react'
import { diagnoseSpanError } from '../runner/errors'
import type { TraceSpan } from '../types'
import { IconCopy } from './UiIcons'

interface Props {
  span: TraceSpan | null
  highlightChunkId?: string | null
  onCopySpan?: () => void
}

export function EvidencePanel({ span, highlightChunkId, onCopySpan }: Props) {
  const chunks = span?.ragChunks ?? []
  const diagnosis = span?.error ? diagnoseSpanError(span.error) : null
  const highlightRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (highlightChunkId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [highlightChunkId, span?.id])

  return (
    <div className="panel-body">
      {!span && <p className="empty">选中时间线或调用图中的节点，查看详情与 RAG 证据。</p>}
      {span && (
        <>
          <div className="detail-top">
            <p className="hint detail-name">
              <strong>{span.name}</strong>
              {' · '}
              {span.kind} · <span className={`badge ${span.status}`}>{span.status}</span>
              {' · '}
              {span.endMs - span.startMs}ms
            </p>
            {onCopySpan && (
              <button
                type="button"
                className="btn btn-tiny btn-icon"
                onClick={onCopySpan}
                title="复制 JSON（快捷键 c）"
                aria-label="复制 JSON"
              >
                <IconCopy />
              </button>
            )}
          </div>

          {span.status === 'error' && (
            <div className="diag-box">
              <div className="diag-title">
                失败诊断{diagnosis ? ` · ${diagnosis.category}` : ''}
              </div>
              {diagnosis && <p className="diag-hint">{diagnosis.hint}</p>}
              <pre className="detail-pre diag-raw">{span.error}</pre>
            </div>
          )}

          {span.kind === 'llm' ? (
            <LlmIoView span={span} />
          ) : (
            <>
              <h3 className="detail-h">INPUT</h3>
              <pre className="detail-pre">{stringify(span.input)}</pre>
              <h3 className="detail-h">OUTPUT</h3>
              <pre className="detail-pre">{stringify(span.output)}</pre>
            </>
          )}

          <h3 className="detail-h">RAG EVIDENCE ({chunks.length})</h3>
          {chunks.length === 0 ? (
            <p className="empty">该节点无检索证据（非 retriever 或未附带 chunks）。</p>
          ) : (
            <div className="evidence-list">
              {chunks.map((c, i) => {
                const active = highlightChunkId === c.id
                return (
                  <article
                    key={c.id}
                    ref={active ? highlightRef : undefined}
                    className={`evidence-card ${active ? 'evidence-hl' : ''}`}
                    id={`chunk-${c.id}`}
                  >
                    <header>
                      <span className="source">
                        [{i + 1}] {c.source}
                      </span>
                      <span className="score">{Number(c.score || 0).toFixed(2)}</span>
                    </header>
                    <p>{c.text}</p>
                  </article>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function LlmIoView({ span }: { span: TraceSpan }) {
  const prompt = extractText(span.input, ['prompt', 'text', 'content', 'task', 'model'])
  const completion = extractText(span.output, ['text', 'raw', 'completion', 'content'])

  return (
    <div className="llm-io">
      <div className="llm-meta">
        {span.meta?.tokens_in != null && <span>in {String(span.meta.tokens_in)}</span>}
        {span.meta?.tokens_out != null && <span>out {String(span.meta.tokens_out)}</span>}
        {span.meta?.streamed != null && <span>{span.meta.streamed ? 'stream' : 'sync'}</span>}
      </div>
      <h3 className="detail-h">PROMPT / INPUT</h3>
      <pre className="detail-pre llm-pre">{prompt || stringify(span.input)}</pre>
      <h3 className="detail-h">COMPLETION / OUTPUT</h3>
      <pre className="detail-pre llm-pre">{completion || stringify(span.output)}</pre>
      <details className="raw-details">
        <summary>原始 JSON</summary>
        <pre className="detail-pre">{stringify({ input: span.input, output: span.output })}</pre>
      </details>
    </div>
  )
}

function extractText(value: unknown, keys: string[]): string | null {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return null
  const obj = value as Record<string, unknown>
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'string' && v.trim()) return v
  }
  return null
}

function stringify(value: unknown) {
  if (value === undefined) return '—'
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}
