import { useRef, useState } from 'react'
import {
  evaluateDataset,
  evalResultsToCsv,
  evalResultsToMarkdown,
  parseDataset,
  type EvalResult,
} from '../analytics/evalHeuristics'
import { mergeJudgeIntoResult, runLlmJudge } from '../analytics/llmJudge'
import { downloadTextFile } from '../adapter/jsonl'
import type { LlmConfig } from '../runner/config'
import { loadLlmConfig } from '../runner/config'
import type { TraceSession } from '../types'
import { IconUpload } from './UiIcons'

interface Props {
  sessions: TraceSession[]
  onToast?: (msg: string) => void
}

export function EvalPanel({ sessions, onToast }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [results, setResults] = useState<EvalResult[]>([])
  const [busy, setBusy] = useState(false)
  const [useJudge, setUseJudge] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runEval = async (text: string) => {
    setError(null)
    setBusy(true)
    try {
      const items = parseDataset(text)
      if (!items.length) throw new Error('数据集为空')
      let next = evaluateDataset(items, sessions)
      if (useJudge) {
        let config: LlmConfig
        try {
          config = loadLlmConfig()
          if (!config.apiKey.trim()) throw new Error('Judge 需要先在 Live Run 填写 API Key')
        } catch (e) {
          throw new Error(e instanceof Error ? e.message : 'Judge 需要 LLM 配置')
        }
        const judged: EvalResult[] = []
        for (let i = 0; i < next.length; i += 1) {
          const r = next[i]!
          const session = sessions.find((s) => s.id === r.sessionId) ?? null
          if (!session) {
            judged.push(r)
            continue
          }
          try {
            const j = await runLlmJudge(
              items[i]!,
              session,
              config,
            )
            judged.push(mergeJudgeIntoResult(r, j))
          } catch (e) {
            judged.push({
              ...r,
              reasons: [
                ...r.reasons,
                `Judge 失败: ${e instanceof Error ? e.message : String(e)}`,
              ],
            })
          }
        }
        next = judged
      }
      setResults(next)
      onToast?.(`评测完成 · ${next.length} 条`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel eval-panel">
      <div className="panel-hd">
        <h2>评测 Eval</h2>
      </div>
      <div className="panel-body">
        <p className="hint" style={{ marginTop: 0 }}>
          导入 dataset（JSON / JSONL：id, question, expected?），对已加载会话做启发式打分；可选 LLM-as-judge。
        </p>
        <div className="eval-actions">
          <button
            type="button"
            className="btn btn-tiny"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            <IconUpload /> 导入 Dataset
          </button>
          <label className="chip">
            <input
              type="checkbox"
              checked={useJudge}
              onChange={(e) => setUseJudge(e.target.checked)}
            />{' '}
            LLM Judge
          </label>
          {results.length > 0 && (
            <>
              <button
                type="button"
                className="btn btn-tiny"
                onClick={() =>
                  downloadTextFile('opentrace-eval.md', evalResultsToMarkdown(results))
                }
              >
                导出 MD
              </button>
              <button
                type="button"
                className="btn btn-tiny"
                onClick={() => downloadTextFile('opentrace-eval.csv', evalResultsToCsv(results))}
              >
                导出 CSV
              </button>
            </>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".json,.jsonl,.txt,application/json"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            await runEval(await file.text())
          }}
        />
        {error && <p className="run-error">{error}</p>}
        {busy && <p className="hint">评测中…</p>}
        {results.length > 0 && (
          <div className="eval-table-wrap">
            <table className="eval-table">
              <thead>
                <tr>
                  <th>id</th>
                  <th>score</th>
                  <th>grade</th>
                  <th>session</th>
                  <th>reasons</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.datasetId} className={`grade-${r.grade}`}>
                    <td>{r.datasetId}</td>
                    <td>{r.score}</td>
                    <td>{r.grade}</td>
                    <td>{r.sessionId ?? '—'}</td>
                    <td className="eval-reasons">{r.reasons.join('；')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
