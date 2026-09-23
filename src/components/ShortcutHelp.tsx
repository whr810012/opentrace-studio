import { IconX } from './UiIcons'

interface Props {
  open: boolean
  onClose: () => void
}

export function ShortcutHelp({ open, onClose }: Props) {
  if (!open) return null
  return (
    <div className="shortcut-backdrop" onClick={onClose} role="presentation">
      <div
        className="shortcut-modal"
        role="dialog"
        aria-label="键盘快捷键"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel-hd">
          <h2>键盘快捷键</h2>
          <button type="button" className="btn" onClick={onClose}>
            <IconX />
            关闭
          </button>
        </div>
        <div className="panel-body">
          <table className="diff-table">
            <tbody>
              <tr>
                <td className="mono">j / ↓</td>
                <td>下一个 span</td>
              </tr>
              <tr>
                <td className="mono">k / ↑</td>
                <td>上一个 span</td>
              </tr>
              <tr>
                <td className="mono">e</td>
                <td>跳到第一个错误</td>
              </tr>
              <tr>
                <td className="mono">g</td>
                <td>沿关键路径前进</td>
              </tr>
              <tr>
                <td className="mono">h / ←</td>
                <td>父 span</td>
              </tr>
              <tr>
                <td className="mono">l / →</td>
                <td>第一个子 span</td>
              </tr>
              <tr>
                <td className="mono">p</td>
                <td>钉选 / 取消钉选</td>
              </tr>
              <tr>
                <td className="mono">c</td>
                <td>复制当前 span JSON</td>
              </tr>
              <tr>
                <td className="mono">/</td>
                <td>聚焦时间线搜索</td>
              </tr>
              <tr>
                <td className="mono">Shift+C</td>
                <td>复制当前会话 JSONL</td>
              </tr>
              <tr>
                <td className="mono">顶栏 · 操作 → 粘贴导入</td>
                <td>从剪贴板导入 JSONL / OTLP JSON</td>
              </tr>
              <tr>
                <td className="mono">顶栏 · 复制 → 分享链接</td>
                <td>分享链接写入 URL</td>
              </tr>
              <tr>
                <td className="mono">顶栏 · 复制 → RAG 快照</td>
                <td>复制 RAG 质检快照 Markdown</td>
              </tr>
              <tr>
                <td className="mono">t</td>
                <td>切换白天 / 夜间主题</td>
              </tr>
              <tr>
                <td className="mono">?</td>
                <td>打开/关闭本帮助</td>
              </tr>
            </tbody>
          </table>
          <p className="hint">在输入框内输入时快捷键不会触发（除 Esc）。</p>
        </div>
      </div>
    </div>
  )
}
