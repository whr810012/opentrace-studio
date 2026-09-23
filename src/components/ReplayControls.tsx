import {
  IconPause,
  IconPlay,
  IconRotateCcw,
  IconStepForward,
  IconZap,
} from './UiIcons'
import { MenuDropdown } from './MenuDropdown'

interface Props {
  playing: boolean
  index: number | null
  total: number
  speed: number
  breakOnError: boolean
  breakOnPin: boolean
  onSpeedChange: (speed: number) => void
  onBreakOnErrorChange: (v: boolean) => void
  onBreakOnPinChange: (v: boolean) => void
  onPlay: () => void
  onPause: () => void
  onStep: () => void
  onReset: () => void
}

const SPEEDS = [0.5, 1, 2, 4]

export function ReplayControls({
  playing,
  index,
  total,
  speed,
  breakOnError,
  breakOnPin,
  onSpeedChange,
  onBreakOnErrorChange,
  onBreakOnPinChange,
  onPlay,
  onPause,
  onStep,
  onReset,
}: Props) {
  const label =
    index === null ? '未开始回放' : `回放进度 ${Math.min(index + 1, total)} / ${total}`

  return (
    <div className="replay-bar">
      <button type="button" className="btn btn-primary" onClick={playing ? onPause : onPlay}>
        {playing ? <IconPause /> : <IconPlay />}
        {playing ? '暂停' : '自动回放'}
      </button>
      <button type="button" className="btn" onClick={onStep} disabled={playing}>
        <IconStepForward />
        单步
      </button>
      <button type="button" className="btn" onClick={onReset}>
        <IconRotateCcw />
        重置
      </button>
      <MenuDropdown
        title="回放倍速"
        label={
          <>
            <IconZap />
            {speed}x
          </>
        }
      >
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            role="menuitem"
            className={`menu-item ${speed === s ? 'menu-item-active' : ''}`}
            onClick={() => onSpeedChange(s)}
          >
            <IconPlay />
            {s}x
          </button>
        ))}
      </MenuDropdown>
      <label className="replay-break" title="落到 error span 时自动暂停">
        <input
          type="checkbox"
          checked={breakOnError}
          onChange={(e) => onBreakOnErrorChange(e.target.checked)}
        />
        断点·错误
      </label>
      <label className="replay-break" title="落到钉选 span 时自动暂停">
        <input
          type="checkbox"
          checked={breakOnPin}
          onChange={(e) => onBreakOnPinChange(e.target.checked)}
        />
        断点·钉选
      </label>
      <span className="hint">{label}</span>
    </div>
  )
}
