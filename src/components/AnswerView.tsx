import { IconLink } from './UiIcons'

interface Props {
  text: string
  streaming?: boolean
  onCite: (index1Based: number) => void
}

export function AnswerView({ text, streaming, onCite }: Props) {
  const parts = splitCitations(text)

  return (
    <p className={streaming ? 'streaming-answer answer-rich' : 'answer-rich'}>
      {parts.map((p, i) =>
        p.type === 'cite' ? (
          <button
            key={i}
            type="button"
            className="cite-btn"
            title={`跳转到证据 [${p.n}]`}
            onClick={() => onCite(p.n)}
          >
            <IconLink />
            [{p.n}]
          </button>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </p>
  )
}

function splitCitations(text: string): Array<{ type: 'text'; text: string } | { type: 'cite'; n: number }> {
  const re = /\[(\d+)\]/g
  const out: Array<{ type: 'text'; text: string } | { type: 'cite'; n: number }> = []
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ type: 'text', text: text.slice(last, m.index) })
    out.push({ type: 'cite', n: Number(m[1]) })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) })
  if (!out.length) out.push({ type: 'text', text: text || '…' })
  return out
}
