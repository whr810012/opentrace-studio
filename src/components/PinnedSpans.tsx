import type { TraceSession } from '../types'
import { IconPin, IconX } from './UiIcons'

interface Props {
  session: TraceSession
  onSelect: (spanId: string) => void
  onUnpin: (spanId: string) => void
}

export function PinnedSpans({ session, onSelect, onUnpin }: Props) {
  const pins = session.pinnedSpanIds ?? []
  if (!pins.length) return null

  return (
    <div className="pinned-bar">
      <span className="stat-label">钉选</span>
      <div className="pinned-list">
        {pins.map((id) => {
          const span = session.spans.find((s) => s.id === id)
          const label = span?.name ?? id
          return (
            <span key={id} className="pinned-chip">
              <button type="button" className="btn-link" onClick={() => onSelect(id)}>
                <IconPin />
                {label}
                {span?.status === 'error' ? ' · err' : ''}
              </button>
              <button
                type="button"
                className="pin-x"
                title="取消钉选"
                onClick={() => onUnpin(id)}
              >
                <IconX />
              </button>
            </span>
          )
        })}
      </div>
    </div>
  )
}
