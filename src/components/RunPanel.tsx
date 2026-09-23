import { useEffect, useState } from 'react'
import { defaultLlmConfig, loadLlmConfig, migrateLlmConfigStorage, saveLlmConfig, type LlmConfig } from '../runner/config'
import {
  IconEye,
  IconEyeOff,
  IconGitCompare,
  IconPlay,
  IconRefresh,
  IconSparkles,
  IconSquare,
} from './UiIcons'

const PRESETS: { id: string; label: string; baseUrl: string; model: string }[] = [
  { id: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' },
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com', model: 'gpt-4o-mini' },
]

interface Props {
  running: boolean
  progress: string | null
  error: string | null
  showGuide: boolean
  activeQuestion?: string | null
  onRun: (question: string, config: LlmConfig) => void
  onCompareRun: (
    question: string,
    configA: LlmConfig,
    configB: LlmConfig,
    opts?: { parallel?: boolean },
  ) => void
  onStop: () => void
}

export function RunPanel({
  running,
  progress,
  error,
  showGuide,
  activeQuestion,
  onRun,
  onCompareRun,
  onStop,
}: Props) {
  const [config, setConfig] = useState<LlmConfig>(defaultLlmConfig)
  const [modelB, setModelB] = useState('gpt-4o-mini')
  const [compareMode, setCompareMode] = useState(false)
  const [parallelCompare, setParallelCompare] = useState(true)
  const [question, setQuestion] = useState(
    '静安寺附近步行 15 分钟内，有哪些适合周末带娃的地方？会不会下雨要带伞吗？',
  )
  const [showKey, setShowKey] = useState(false)
  const [configReady, setConfigReady] = useState(false)
  const [configSaveWarn, setConfigSaveWarn] = useState<string | null>(null)

  useEffect(() => {
    migrateLlmConfigStorage()
    setConfig(loadLlmConfig())
    setConfigReady(true)
  }, [])

  useEffect(() => {
    if (!configReady) return
    const ok = saveLlmConfig(config)
    setConfigSaveWarn(ok ? null : '本机存储失败，配置可能无法保存')
  }, [config, configReady])

  const update = (patch: Partial<LlmConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }))
  }

  const applyPreset = (id: string) => {
    const p = PRESETS.find((x) => x.id === id)
    if (!p) return
    update({ baseUrl: p.baseUrl, model: p.model })
  }

  const canRun =
    Boolean(question.trim()) &&
    Boolean(config.baseUrl.trim()) &&
    Boolean(config.apiKey.trim()) &&
    Boolean(config.model.trim()) &&
    (!compareMode || Boolean(modelB.trim()))

  const configB: LlmConfig = { ...config, model: modelB.trim() }

  return (
    <section className="run-panel">
      <div className="panel-hd">
        <h2>Live Run · 真 API</h2>
        <span className="hint">
          {running ? progress || '运行中…' : '填写地址 / Key / Model'}
        </span>
      </div>
      <div className="run-body">
        {showGuide && (
          <ol className="guide-steps">
            <li>
              <strong>配置</strong>
              <span>预设填地址与 Model，再贴 API Key</span>
            </li>
            <li>
              <strong>运行</strong>
              <span>写入 Trace；可开双模型对比</span>
            </li>
            <li>
              <strong>查看</strong>
              <span>时间线、引用与 Diff</span>
            </li>
          </ol>
        )}

        <div className="preset-row">
          <span className="preset-label">快速预设</span>
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="btn"
              disabled={running}
              onClick={() => applyPreset(p.id)}
            >
              <IconSparkles />
              {p.label}
            </button>
          ))}
          <label className="compare-toggle">
            <input
              type="checkbox"
              checked={compareMode}
              disabled={running}
              onChange={(e) => setCompareMode(e.target.checked)}
            />
            双模型对比
          </label>
          {compareMode && (
            <label className="compare-toggle">
              <input
                type="checkbox"
                checked={parallelCompare}
                disabled={running}
                onChange={(e) => setParallelCompare(e.target.checked)}
              />
              并行跑
            </label>
          )}
        </div>

        <div className="run-grid">
          <label>
            API 地址
            <input
              value={config.baseUrl}
              onChange={(e) => update({ baseUrl: e.target.value })}
              placeholder="https://api.deepseek.com"
              disabled={running}
            />
          </label>
          <label>
            Model {compareMode ? 'A' : ''}
            <input
              value={config.model}
              onChange={(e) => update({ model: e.target.value })}
              placeholder="deepseek-chat"
              disabled={running}
            />
          </label>
          {compareMode && (
            <label>
              Model B
              <input
                value={modelB}
                onChange={(e) => setModelB(e.target.value)}
                placeholder="gpt-4o-mini"
                disabled={running}
              />
            </label>
          )}
          <label className="run-key">
            API Key
            <div className="key-row">
              <input
                type={showKey ? 'text' : 'password'}
                value={config.apiKey}
                onChange={(e) => update({ apiKey: e.target.value })}
                placeholder="API Key（仅当前标签页）"
                disabled={running}
                autoComplete="off"
              />
              <button
                type="button"
                className="btn btn-icon"
                onClick={() => setShowKey((v) => !v)}
                title={showKey ? '隐藏 API Key' : '显示 API Key'}
                aria-label={showKey ? '隐藏 API Key' : '显示 API Key'}
              >
                {showKey ? <IconEyeOff /> : <IconEye />}
              </button>
            </div>
          </label>
        </div>
        {compareMode && (
          <p className="hint compare-hint">
            同一 Key {parallelCompare ? '并行' : '依次'}跑 A/B，结束后打开 Diff。
            {config.model === modelB.trim() ? ' 当前 A/B 模型名相同。' : ''}
          </p>
        )}
        <label className="run-q">
          问题
          <textarea
            rows={3}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={running}
          />
        </label>
        <div className="run-actions">
          {!running ? (
            <>
              {compareMode ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() =>
                    onCompareRun(question.trim(), config, configB, { parallel: parallelCompare })
                  }
                  disabled={!canRun}
                >
                  <IconGitCompare />
                  双模型对比运行
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => onRun(question.trim(), config)}
                  disabled={!canRun}
                >
                  <IconPlay />
                  在平台运行并写入 Trace
                </button>
              )}
              <button
                type="button"
                className="btn"
                disabled={!canRun || !activeQuestion}
                title={activeQuestion ? '用当前配置重跑' : '需要已有会话'}
                onClick={() => {
                  if (!activeQuestion) return
                  setQuestion(activeQuestion)
                  if (compareMode)
                    onCompareRun(activeQuestion, config, configB, { parallel: parallelCompare })
                  else onRun(activeQuestion, config)
                }}
              >
                <IconRefresh />
                重跑当前问题
              </button>
            </>
          ) : (
            <button type="button" className="btn" onClick={onStop}>
              <IconSquare />
              停止
            </button>
          )}
          {running && progress && <span className="progress-pill">{progress}</span>}
          <span className="hint">
            地址不要加 <code>/v1</code>
          </span>
        </div>
        {configSaveWarn && <p className="hint">{configSaveWarn}</p>}
        {error && <p className="run-error">{error}</p>}
      </div>
    </section>
  )
}
