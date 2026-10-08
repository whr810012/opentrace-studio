import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  downloadTextFile,
  sessionToJsonl,
} from './adapter/jsonl'
import { parseImportedSessions } from './adapter/importTrace'
import { sessionToMarkdown } from './adapter/markdownReport'
import { sessionToCsv } from './adapter/csvReport'
import { sessionToHtml } from './adapter/htmlReport'
import {
  computeSessionStats,
  findFirstErrorSpanId,
  resolveCitation,
} from './analytics/sessionStats'
import { buildRagSnapshot, ragSnapshotToMarkdown } from './analytics/ragSnapshot'
import {
  decodeSessionShare,
  encodeSessionShare,
  firstChildSpanId,
  nextCriticalPathSpanId,
  parentSpanId,
} from './analytics/criticalPath'
import { AnswerView } from './components/AnswerView'
import { CallGraph } from './components/CallGraph'
import { EvidencePanel } from './components/EvidencePanel'
import { EvalPanel } from './components/EvalPanel'
import { MenuDropdown } from './components/MenuDropdown'
import { PinnedSpans } from './components/PinnedSpans'
import { ReplayControls } from './components/ReplayControls'
import { RunDiff } from './components/RunDiff'
import { RunPanel } from './components/RunPanel'
import { SessionStats } from './components/SessionStats'
import { ShortcutHelp } from './components/ShortcutHelp'
import { Timeline } from './components/Timeline'
import { Waterfall } from './components/Waterfall'
import {
  IconClipboard,
  IconCopy,
  IconDatabase,
  IconDownload,
  IconFileCode,
  IconFileText,
  IconGlobe,
  IconKeyboard,
  IconLayers,
  IconLink,
  IconMoon,
  IconRoute,
  IconSliders,
  IconSun,
  IconTable,
  IconTrash,
  IconUpload,
} from './components/UiIcons'
import type { LlmConfig } from './runner/config'
import { friendlyError } from './runner/errors'
import { runLiveAgent } from './runner/liveAgent'
import { loadSessions, saveSessions } from './storage/sessions'
import { MAX_IMPORT_BYTES, MAX_IMPORT_CHARS, mergeSessionsFront, sanitizeSession } from './storage/sanitize'
import type { SpanKind, TraceSession, TraceSpan } from './types'
import { pollOtlpIngestBuffer } from './ingest/otlpPoll'
import { copyText } from './utils/clipboard'

const ALL_KINDS: SpanKind[] = ['llm', 'tool', 'retriever', 'chain', 'custom']
const THEME_KEY = 'opentrace-theme'
type ThemeMode = 'light' | 'dark'

function readTheme(): ThemeMode {
  if (typeof document === 'undefined') return 'dark'
  const attr = document.documentElement.getAttribute('data-theme')
  if (attr === 'light' || attr === 'dark') return attr
  try {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    /* ignore */
  }
  return 'dark'
}

export default function App() {
  const initial = useMemo(() => loadSessions(), [])
  const [sessions, setSessions] = useState<TraceSession[]>(initial.sessions)
  const [activeId, setActiveId] = useState<string | null>(initial.activeId)
  const [selectedId, setSelectedId] = useState<string | null>(
    initial.sessions.find((s) => s.id === initial.activeId)?.spans[0]?.id ?? null,
  )
  const [highlightChunkId, setHighlightChunkId] = useState<string | null>(null)
  const [kindFilter, setKindFilter] = useState<Set<SpanKind>>(new Set(ALL_KINDS))
  const [replayIndex, setReplayIndex] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [replaySpeed, setReplaySpeed] = useState(1)
  const [breakOnError, setBreakOnError] = useState(true)
  const [breakOnPin, setBreakOnPin] = useState(false)
  const [running, setRunning] = useState(false)
  const [runProgress, setRunProgress] = useState<string | null>(null)
  const [runError, setRunError] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [diffPair, setDiffPair] = useState<{ a: string; b: string } | null>(null)
  const [sessionQuery, setSessionQuery] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [errorsOnly, setErrorsOnly] = useState(false)
  const [theme, setTheme] = useState<ThemeMode>(() => readTheme())
  const [ingestListening, setIngestListening] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<number | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const firstErrorRef = useRef<string | null>(null)
  const selectOnUpsertRef = useRef(true)

  const active = sessions.find((s) => s.id === activeId) ?? null
  const orderedSpans = useMemo(
    () => [...(active?.spans ?? [])].sort((a, b) => a.startMs - b.startMs),
    [active],
  )

  const selected =
    orderedSpans.find((s) => s.id === selectedId) ??
    (replayIndex !== null ? orderedSpans[replayIndex] : null) ??
    null

  const filteredSessions = useMemo(() => {
    const q = sessionQuery.trim().toLowerCase()
    return sessions.filter((s) => {
      if (errorsOnly && !s.spans.some((x) => x.status === 'error')) return false
      if (!q) return true
      return `${s.title} ${s.question} ${s.model ?? ''} ${s.id}`.toLowerCase().includes(q)
    })
  }, [sessions, sessionQuery, errorsOnly])

  const flash = useCallback((msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 1800)
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      /* ignore */
    }
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }, [])

  const selectSpan = useCallback((id: string, chunkId?: string | null) => {
    setSelectedId(id)
    setHighlightChunkId(chunkId ?? null)
    setReplayIndex(null)
    setPlaying(false)
  }, [])

  const togglePin = useCallback(
    (spanId: string) => {
      if (!activeId) return
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== activeId) return s
          const cur = s.pinnedSpanIds ?? []
          const next = cur.includes(spanId)
            ? cur.filter((x) => x !== spanId)
            : [...cur, spanId]
          return { ...s, pinnedSpanIds: next }
        }),
      )
      flash('已更新钉选')
    },
    [activeId, flash],
  )

  const updateNote = useCallback(
    (note: string) => {
      if (!activeId) return
      setSessions((prev) =>
        prev.map((s) => (s.id === activeId ? { ...s, note } : s)),
      )
    },
    [activeId],
  )

  const navigateSpan = useCallback(
    (delta: number) => {
      if (!orderedSpans.length) return
      const idx = orderedSpans.findIndex((s) => s.id === selectedId)
      const base = idx === -1 ? (delta > 0 ? -1 : 0) : idx
      const next = Math.max(0, Math.min(orderedSpans.length - 1, base + delta))
      selectSpan(orderedSpans[next].id)
    },
    [orderedSpans, selectedId, selectSpan],
  )

  const jumpCriticalPath = useCallback(() => {
    if (!active) return
    const id = nextCriticalPathSpanId(active.spans, selectedId)
    if (id) selectSpan(id)
    else flash('无关键路径')
  }, [active, selectedId, selectSpan, flash])

  const jumpParent = useCallback(() => {
    if (!active) return
    const id = parentSpanId(active.spans, selectedId)
    if (id) selectSpan(id)
    else flash('已在根节点或无父 span')
  }, [active, selectedId, selectSpan, flash])

  const jumpChild = useCallback(() => {
    if (!active) return
    const id = firstChildSpanId(active.spans, selectedId)
    if (id) selectSpan(id)
    else flash('无子 span')
  }, [active, selectedId, selectSpan, flash])

  const copySelectedSpan = useCallback(async () => {
    if (!selected) {
      flash('没有选中的 span')
      return
    }
    const ok = await copyText(JSON.stringify(selected, null, 2))
    flash(ok ? '已复制 span JSON' : '复制失败')
  }, [selected, flash])

  const copyActiveJsonl = useCallback(async () => {
    if (!active) {
      flash('没有活动会话')
      return
    }
    const ok = await copyText(sessionToJsonl(active))
    flash(ok ? '已复制会话 JSONL' : '复制失败')
  }, [active, flash])

  useEffect(() => {
    const isTypingTarget = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false
      const tag = el.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowShortcuts(false)
        return
      }
      if (isTypingTarget(e.target)) return

      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault()
        setShowShortcuts((v) => !v)
        return
      }
      if (e.key === '/') {
        e.preventDefault()
        document.getElementById('timeline-search')?.focus()
        return
      }
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault()
        navigateSpan(1)
        return
      }
      if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault()
        navigateSpan(-1)
        return
      }
      if (e.key === 'e') {
        e.preventDefault()
        if (!active) return
        const id = findFirstErrorSpanId(active)
        if (id) selectSpan(id)
        else flash('当前会话无错误 span')
        return
      }
      if (e.key === 'g') {
        e.preventDefault()
        jumpCriticalPath()
        return
      }
      if (e.key === 'h' || e.key === 'ArrowLeft') {
        e.preventDefault()
        jumpParent()
        return
      }
      if (e.key === 'l' || e.key === 'ArrowRight') {
        e.preventDefault()
        jumpChild()
        return
      }
      if (e.key === 'p') {
        e.preventDefault()
        if (!selectedId || !activeId) {
          flash('先选中一个 span 再钉选')
          return
        }
        togglePin(selectedId)
        return
      }
      if (e.key === 't') {
        e.preventDefault()
        toggleTheme()
        return
      }
      if (e.key === 'c' && !e.shiftKey) {
        e.preventDefault()
        void copySelectedSpan()
        return
      }
      if (e.key === 'C' && e.shiftKey) {
        e.preventDefault()
        void copyActiveJsonl()
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    active,
    activeId,
    selectedId,
    navigateSpan,
    selectSpan,
    togglePin,
    toggleTheme,
    copySelectedSpan,
    copyActiveJsonl,
    jumpCriticalPath,
    jumpParent,
    jumpChild,
    flash,
  ])

  useEffect(() => {
    setHydrated(true)
  }, [])

  const saveFailFlashedRef = useRef(false)

  useEffect(() => {
    if (!hydrated) return
    const ok = saveSessions(sessions, activeId)
    if (!ok) {
      if (!saveFailFlashedRef.current) {
        saveFailFlashedRef.current = true
        flash('本机存储空间不足，会话可能未全部保存')
      }
    } else {
      saveFailFlashedRef.current = false
    }
  }, [sessions, activeId, hydrated, flash])

  useEffect(() => {
    if (!playing || !active) return
    const ms = Math.max(120, Math.round(700 / replaySpeed))
    const spans = orderedSpans
    timerRef.current = window.setInterval(() => {
      setReplayIndex((prev) => {
        const next = prev === null ? 0 : prev + 1
        if (next >= spans.length) {
          return spans.length - 1
        }
        return next
      })
    }, ms)
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current)
    }
  }, [playing, active, orderedSpans, replaySpeed])

  useEffect(() => {
    if (!playing || replayIndex === null || !orderedSpans.length) return
    const span = orderedSpans[replayIndex]
    if (!span) return
    setSelectedId(span.id)
    const pinned = active?.pinnedSpanIds ?? []
    if (
      (breakOnError && span.status === 'error') ||
      (breakOnPin && pinned.includes(span.id))
    ) {
      setPlaying(false)
      return
    }
    if (replayIndex >= orderedSpans.length - 1) {
      setPlaying(false)
    }
  }, [playing, replayIndex, orderedSpans, breakOnError, breakOnPin, active])

  const onToggleKind = useCallback((kind: SpanKind) => {
    setKindFilter((prev) => {
      const next = new Set(prev)
      if (next.has(kind)) next.delete(kind)
      else next.add(kind)
      if (next.size === 0) return new Set(ALL_KINDS)
      return next
    })
  }, [])

  const upsertSpan = useCallback((sessionId: string, span: TraceSpan) => {
    if (span.status === 'error' && !firstErrorRef.current) {
      firstErrorRef.current = span.id
    }
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId) return s
        const idx = s.spans.findIndex((x) => x.id === span.id)
        const spans =
          idx === -1 ? [...s.spans, span] : s.spans.map((x, i) => (i === idx ? span : x))
        return { ...s, spans }
      }),
    )
    if (selectOnUpsertRef.current) setSelectedId(span.id)
  }, [])

  const startLiveRun = async (
    question: string,
    config: LlmConfig,
    opts?: { runLabel?: string; manageRunning?: boolean },
  ): Promise<string | null> => {
    const manageRunning = opts?.manageRunning !== false
    setRunError(null)
    setRunProgress('准备中…')
    setPlaying(false)
    setReplayIndex(null)
    setHighlightChunkId(null)
    if (manageRunning) setRunning(true)
    firstErrorRef.current = null
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    try {
      const sessionId = await runLiveAgent({
        question,
        config,
        runLabel: opts?.runLabel,
        signal: ac.signal,
        hooks: {
          onSession: (session) => {
            setSessions((prev) => [session, ...prev].slice(0, 20))
            setActiveId(session.id)
            setSelectedId(null)
          },
          onSpanUpsert: upsertSpan,
          onAnswerDelta: (sid, fullText) => {
            setSessions((prev) =>
              prev.map((s) => (s.id === sid ? { ...s, answer: fullText } : s)),
            )
          },
          onAnswer: (sid, answer) => {
            setSessions((prev) =>
              prev.map((s) => (s.id === sid ? { ...s, answer } : s)),
            )
          },
          onProgress: setRunProgress,
        },
      })

      if (firstErrorRef.current) {
        selectSpan(firstErrorRef.current)
      }
      return sessionId
    } catch (e) {
      setRunError(friendlyError(e))
      if (firstErrorRef.current) {
        selectSpan(firstErrorRef.current)
      }
      return null
    } finally {
      if (manageRunning) {
        setRunning(false)
        setRunProgress(null)
      }
      abortRef.current = null
    }
  }

  const startCompareRun = async (
    question: string,
    configA: LlmConfig,
    configB: LlmConfig,
    opts?: { parallel?: boolean },
  ) => {
    setRunError(null)
    setRunning(true)
    selectOnUpsertRef.current = false
    firstErrorRef.current = null

    const runOne = async (config: LlmConfig, runLabel: string, signal: AbortSignal) => {
      try {
        return await runLiveAgent({
          question,
          config,
          runLabel,
          signal,
          hooks: {
            onSession: (session) => {
              setSessions((prev) => [session, ...prev].slice(0, 20))
              setActiveId(session.id)
            },
            onSpanUpsert: upsertSpan,
            onAnswerDelta: (sid, fullText) => {
              setSessions((prev) =>
                prev.map((s) => (s.id === sid ? { ...s, answer: fullText } : s)),
              )
            },
            onAnswer: (sid, answer) => {
              setSessions((prev) =>
                prev.map((s) => (s.id === sid ? { ...s, answer } : s)),
              )
            },
            onProgress: (label) => setRunProgress(`${runLabel} · ${label}`),
          },
        })
      } catch (e) {
        setRunError(friendlyError(e))
        return null
      }
    }

    try {
      abortRef.current?.abort()
      const ac = new AbortController()
      abortRef.current = ac

      if (opts?.parallel) {
        setRunProgress(`并行对比 · ${configA.model} + ${configB.model}`)
        const [idA, idB] = await Promise.all([
          runOne(configA, `A·${configA.model}`, ac.signal),
          runOne(configB, `B·${configB.model}`, ac.signal),
        ])
        if (idA && idB) {
          setDiffPair({ a: idA, b: idB })
          setActiveId(idB)
        }
      } else {
        setRunProgress(`对比 1/2 · ${configA.model}`)
        const idA = await startLiveRun(question, configA, {
          runLabel: `A·${configA.model}`,
          manageRunning: false,
        })
        if (!idA) return
        setRunProgress(`对比 2/2 · ${configB.model}`)
        const idB = await startLiveRun(question, configB, {
          runLabel: `B·${configB.model}`,
          manageRunning: false,
        })
        if (idA && idB) {
          setDiffPair({ a: idA, b: idB })
          setActiveId(idB)
        }
      }
    } finally {
      selectOnUpsertRef.current = true
      setRunning(false)
      setRunProgress(null)
      abortRef.current = null
    }
  }

  const importJsonl = async (file: File) => {
    try {
      if (file.size > MAX_IMPORT_BYTES) {
        setRunError(`导入文件过大（上限约 ${Math.round(MAX_IMPORT_BYTES / 1_000_000)}MB）`)
        return
      }
      const text = await file.text()
      if (text.length > MAX_IMPORT_CHARS) {
        setRunError(`导入内容过大（上限 ${MAX_IMPORT_CHARS.toLocaleString()} 字符）`)
        return
      }
      ingestSessions(parseImportedSessions(text))
    } catch (e) {
      setRunError(friendlyError(e))
    }
  }

  const importFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (!text.trim()) {
        flash('剪贴板为空')
        return
      }
      if (text.length > MAX_IMPORT_CHARS) {
        setRunError(`剪贴板内容过大（上限 ${MAX_IMPORT_CHARS.toLocaleString()} 字符）`)
        return
      }
      ingestSessions(parseImportedSessions(text))
      flash('已从剪贴板导入')
    } catch (e) {
      setRunError(friendlyError(e))
      flash('无法读取剪贴板（需权限或 HTTPS/localhost）')
    }
  }

  const ingestSessions = (imported: TraceSession[], opts?: { confirmShare?: boolean }) => {
    const cleaned = imported.map(sanitizeSession).filter(Boolean) as TraceSession[]
    if (!cleaned.length) {
      setRunError('未解析到有效 session，请检查 JSONL / OTLP / LangGraph / Dify 导出。')
      return
    }
    if (opts?.confirmShare) {
      const ok = window.confirm(
        `加载分享会话「${cleaned[0].title}」（${cleaned[0].spans.length} spans）？`,
      )
      if (!ok) return
    }
    setSessions((prev) => mergeSessionsFront(prev, cleaned, 20))
    setActiveId(cleaned[0].id)
    const firstErr = findFirstErrorSpanId(cleaned[0])
    setSelectedId(firstErr ?? cleaned[0].spans[0]?.id ?? null)
    setHighlightChunkId(null)
    setReplayIndex(null)
    setPlaying(false)
    setRunError(null)
    if (opts?.confirmShare) flash('已从分享链接加载会话')
  }

  useEffect(() => {
    const raw = window.location.hash.replace(/^#/, '')
    if (!raw.startsWith('ot=')) return
    const session = decodeSessionShare(raw.slice(3))
    if (!session) {
      setRunError('分享链接无效或过大，已忽略。')
      return
    }
    ingestSessions([session], { confirmShare: true })
    // hash bootstrap once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const shareActive = async () => {
    if (!active) return
    try {
      const encoded = encodeSessionShare(active)
      if (encoded.length > 80_000) {
        flash('会话过大，无法放入 URL，请改用导出 JSONL')
        return
      }
      const url = `${window.location.origin}${window.location.pathname}#ot=${encoded}`
      window.location.hash = `ot=${encoded}`
      const ok = await copyText(url)
      flash(ok ? '分享链接已复制' : '已写入地址栏，请手动复制')
    } catch {
      flash('生成分享链接失败')
    }
  }

  const loadDemo = async (path: string) => {
    try {
      const res = await fetch(path)
      if (!res.ok) throw new Error(`无法加载样例 ${path}`)
      ingestSessions(parseImportedSessions(await res.text()))
    } catch (e) {
      setRunError(friendlyError(e))
    }
  }

  useEffect(() => {
    if (!ingestListening) return
    let cancelled = false
    const tick = async () => {
      try {
        const incoming = await pollOtlpIngestBuffer({ drain: true })
        if (cancelled || !incoming.length) return
        ingestSessions(incoming)
        flash(`OTLP ingest · ${incoming.length} session`)
      } catch {
        /* dev server may be unavailable */
      }
    }
    void tick()
    const id = window.setInterval(() => void tick(), 2500)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [ingestListening, flash])

  const exportActive = () => {
    if (!active) return
    const safe = active.id.replace(/[^\w.-]+/g, '_')
    downloadTextFile(`${safe}.jsonl`, sessionToJsonl(active))
  }

  const exportMarkdown = () => {
    if (!active) return
    const safe = active.id.replace(/[^\w.-]+/g, '_')
    downloadTextFile(`${safe}-report.md`, sessionToMarkdown(active))
  }

  const copyRagSnapshot = async () => {
    if (!active) {
      flash('没有活动会话')
      return
    }
    const md = ragSnapshotToMarkdown(buildRagSnapshot(active))
    const ok = await copyText(md)
    flash(ok ? '已复制 RAG 质检快照' : '复制失败')
  }

  const exportHtml = () => {
    if (!active) return
    const safe = active.id.replace(/[^\w.-]+/g, '_')
    downloadTextFile(`${safe}-report.html`, sessionToHtml(active))
  }

  const exportCsv = () => {
    if (!active) return
    const safe = active.id.replace(/[^\w.-]+/g, '_')
    downloadTextFile(`${safe}-spans.csv`, sessionToCsv(active))
  }

  const onCite = (n: number) => {
    if (!active) return
    const hit = resolveCitation(active, n)
    if (!hit) {
      setRunError(`未找到引用 [${n}] 对应的检索证据。`)
      return
    }
    setRunError(null)
    selectSpan(hit.spanId, hit.chunkId)
  }

  const deleteSession = (id: string) => {
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id)
      if (activeId === id) {
        setActiveId(next[0]?.id ?? null)
        setSelectedId(next[0]?.spans[0]?.id ?? null)
      }
      return next
    })
    setReplayIndex(null)
    setPlaying(false)
  }

  const clearAll = () => {
    if (!window.confirm('清空本机保存的全部会话？此操作不可恢复。')) return
    setSessions([])
    setActiveId(null)
    setSelectedId(null)
    setHighlightChunkId(null)
    setReplayIndex(null)
    setPlaying(false)
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <strong>OpenTrace Studio</strong>
          <span>AI 工具链 · 本地 Trace 工作台</span>
        </div>
        <div className="top-actions">
          <MenuDropdown
            label={
              <>
                <IconSliders />
                操作
              </>
            }
          >
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={toggleTheme}
              title={theme === 'dark' ? '切换到白天模式' : '切换到夜间模式'}
            >
              {theme === 'dark' ? <IconSun /> : <IconMoon />}
              {theme === 'dark' ? '白天模式' : '夜间模式'}
            </button>
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={() => fileRef.current?.click()}
            >
              <IconUpload />
              导入 JSONL / OTLP / 框架
            </button>
            <button
              type="button"
              role="menuitem"
              className={`menu-item ${ingestListening ? 'on' : ''}`}
              onClick={() => {
                setIngestListening((v) => !v)
                flash(!ingestListening ? '已开启本地 OTLP 监听' : '已停止 OTLP 监听')
              }}
              title="开发态：轮询 POST /opentrace/v1/traces"
            >
              <IconGlobe />
              {ingestListening ? '停止 OTLP 监听' : '监听本地 OTLP'}
            </button>
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={() => void importFromClipboard()}
            >
              <IconClipboard />
              粘贴导入
            </button>
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={jumpCriticalPath}
              disabled={!active}
            >
              <IconRoute />
              关键路径
            </button>
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={() => setShowShortcuts(true)}
            >
              <IconKeyboard />
              快捷键
            </button>
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={clearAll}
              disabled={!sessions.length}
            >
              <IconTrash />
              清空历史
            </button>
          </MenuDropdown>

          <MenuDropdown
            label={
              <>
                <IconCopy />
                复制
              </>
            }
          >
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={() => void copyRagSnapshot()}
              disabled={!active}
            >
              <IconLayers />
              RAG 快照
            </button>
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={() => void copyActiveJsonl()}
              disabled={!active}
            >
              <IconFileCode />
              复制 JSONL
            </button>
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={() => void shareActive()}
              disabled={!active}
            >
              <IconLink />
              分享链接
            </button>
          </MenuDropdown>

          <MenuDropdown
            label={
              <>
                <IconDownload />
                导出
              </>
            }
          >
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={exportActive}
              disabled={!active}
            >
              <IconFileCode />
              导出 JSONL
            </button>
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={exportMarkdown}
              disabled={!active}
            >
              <IconFileText />
              导出 MD
            </button>
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={exportHtml}
              disabled={!active}
            >
              <IconGlobe />
              导出 HTML
            </button>
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={exportCsv}
              disabled={!active}
            >
              <IconTable />
              导出 CSV
            </button>
          </MenuDropdown>

          <input
            ref={fileRef}
            type="file"
            accept=".jsonl,.json,.txt,application/jsonl,application/json,text/plain"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importJsonl(file)
              e.target.value = ''
            }}
          />
          <ReplayControls
            playing={playing}
            index={replayIndex}
            total={orderedSpans.length}
            speed={replaySpeed}
            breakOnError={breakOnError}
            breakOnPin={breakOnPin}
            onSpeedChange={setReplaySpeed}
            onBreakOnErrorChange={setBreakOnError}
            onBreakOnPinChange={setBreakOnPin}
            onPlay={() => {
              if (!orderedSpans.length) return
              if (replayIndex === null || replayIndex >= orderedSpans.length - 1) {
                setReplayIndex(0)
                setSelectedId(orderedSpans[0]?.id ?? null)
              }
              setPlaying(true)
            }}
            onPause={() => setPlaying(false)}
            onStep={() => {
              if (!orderedSpans.length) return
              setPlaying(false)
              setReplayIndex((prev) => {
                const next = prev === null ? 0 : Math.min(prev + 1, orderedSpans.length - 1)
                setSelectedId(orderedSpans[next]?.id ?? null)
                return next
              })
            }}
            onReset={() => {
              setPlaying(false)
              setReplayIndex(null)
            }}
          />
        </div>
      </header>

      <div className="layout">
        <aside className="panel">
          <div className="panel-hd">
            <h2>Sessions</h2>
            <span className="hint">{sessions.length}/20</span>
          </div>
          <div className="panel-body">
            {sessions.length > 0 && (
              <>
                <input
                  className="timeline-search session-search"
                  type="search"
                  placeholder="筛选会话…"
                  value={sessionQuery}
                  onChange={(e) => setSessionQuery(e.target.value)}
                />
                <label className="compare-toggle session-filter-err">
                  <input
                    type="checkbox"
                    checked={errorsOnly}
                    onChange={(e) => setErrorsOnly(e.target.checked)}
                  />
                  仅含错误
                </label>
              </>
            )}
            {!sessions.length && (
              <>
                <p className="empty">暂无会话。按右侧三步引导完成首次运行，或导入 JSONL / OTLP。</p>
                <div className="demo-links">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => void loadDemo(`${import.meta.env.BASE_URL}demo/offline-pitch.jsonl`)}
                  >
                    <IconFileCode />
                    加载离线样例 JSONL
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => void loadDemo(`${import.meta.env.BASE_URL}demo/sample-otlp.json`)}
                  >
                    <IconDatabase />
                    加载 OTLP 样例
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => void loadDemo(`${import.meta.env.BASE_URL}demo/sample-langgraph.json`)}
                  >
                    <IconLayers />
                    加载 LangGraph 样例
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => void loadDemo(`${import.meta.env.BASE_URL}demo/sample-dify.json`)}
                  >
                    <IconRoute />
                    加载 Dify 样例
                  </button>
                </div>
              </>
            )}
            {sessions.length > 0 && !filteredSessions.length && (
              <p className="empty">无匹配会话。</p>
            )}
            {filteredSessions.map((s) => {
              const err = s.spans.filter((x) => x.status === 'error').length
              return (
                <div
                  key={s.id}
                  className={`session-card-wrap ${s.id === active?.id ? 'active' : ''}`}
                >
                  <button
                    type="button"
                    className={`session-card ${s.id === active?.id ? 'active' : ''}`}
                    onClick={() => {
                      setActiveId(s.id)
                      setSelectedId(s.spans[0]?.id ?? null)
                      setHighlightChunkId(null)
                      setReplayIndex(null)
                      setPlaying(false)
                    }}
                  >
                    <h3>{s.title}</h3>
                    <p>
                      {s.spans.length} spans
                      {err ? ` · ${err} 失败` : ''}
                      {s.model ? ` · ${s.model}` : ''} ·{' '}
                      {new Date(s.startedAt).toLocaleString()}
                    </p>
                  </button>
                  <button
                    type="button"
                    className="btn btn-icon session-del"
                    title="删除会话"
                    aria-label="删除会话"
                    onClick={() => deleteSession(s.id)}
                  >
                    <IconTrash />
                  </button>
                </div>
              )
            })}
            <p className="hint">会话自动保存在本机浏览器（最多 20 条）。按 ? 查看快捷键。</p>
          </div>
        </aside>

        <main className="center-stack live-stack">
          <RunPanel
            running={running}
            progress={runProgress}
            error={runError}
            showGuide={!sessions.length}
            activeQuestion={active?.question ?? null}
            onRun={(q, cfg) => void startLiveRun(q, cfg)}
            onCompareRun={(q, a, b, opts) => void startCompareRun(q, a, b, opts)}
            onStop={() => abortRef.current?.abort()}
          />

          <section className="qa-box">
            {active ? (
              <>
                <SessionStats
                  session={active}
                  onJumpError={() => {
                    const id = findFirstErrorSpanId(active)
                    if (id) selectSpan(id)
                  }}
                  onJumpSlowest={() => {
                    const slow = computeSessionStats(active).slowest
                    if (slow) selectSpan(slow.id)
                  }}
                />
                <PinnedSpans
                  session={active}
                  onSelect={(id) => selectSpan(id)}
                  onUnpin={togglePin}
                />
                <div className="label">Question</div>
                <p>{active.question}</p>
                {(active.answer || running) && (
                  <>
                    <div className="label">
                      Answer {running ? '· 生成中' : ''}
                      <span className="hint"> · 点击 [n] 跳转证据</span>
                    </div>
                    <AnswerView
                      text={active.answer || '…'}
                      streaming={Boolean(running && active.answer)}
                      onCite={onCite}
                    />
                  </>
                )}
                <label className="session-note">
                  <span className="label">备注</span>
                  <textarea
                    rows={2}
                    placeholder="可选备注，导出会带上"
                    value={active.note ?? ''}
                    onChange={(e) => updateNote(e.target.value)}
                  />
                </label>
              </>
            ) : (
              <p className="empty">运行 Live Agent 或导入 JSONL 后，将在此显示问答。</p>
            )}
          </section>

          <section className="panel">
            <div className="panel-hd">
              <h2>Trace Timeline</h2>
            </div>
            {active ? (
              <Timeline
                session={active}
                selectedId={selected?.id ?? null}
                replayIndex={replayIndex}
                kindFilter={kindFilter}
                pinnedIds={new Set(active.pinnedSpanIds ?? [])}
                onSelect={(id) => selectSpan(id)}
                onToggleKind={onToggleKind}
                onTogglePin={togglePin}
              />
            ) : (
              <div className="panel-body">
                <p className="empty">暂无 Trace。</p>
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel-hd">
              <h2>Waterfall</h2>
            </div>
            {active ? (
              <Waterfall
                session={active}
                selectedId={selected?.id ?? null}
                onSelect={(id) => selectSpan(id)}
              />
            ) : (
              <div className="panel-body">
                <p className="empty">暂无瀑布图。</p>
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel-hd">
              <h2>Tool Call Graph</h2>
            </div>
            {active ? (
              <CallGraph
                session={active}
                selectedId={selected?.id ?? null}
                replayIndex={replayIndex}
                onSelect={(id) => selectSpan(id)}
              />
            ) : (
              <div className="panel-body">
                <p className="empty">暂无调用图。</p>
              </div>
            )}
          </section>

          <RunDiff
            sessions={sessions}
            activeId={activeId}
            forcePair={diffPair}
            onForcePairConsumed={() => setDiffPair(null)}
          />

          <EvalPanel sessions={sessions} onToast={flash} />
        </main>

        <aside className="panel">
          <div className="panel-hd">
            <h2>Evidence & Detail</h2>
          </div>
          <EvidencePanel
            span={selected}
            highlightChunkId={highlightChunkId}
            onCopySpan={() => void copySelectedSpan()}
          />
        </aside>
      </div>

      <ShortcutHelp open={showShortcuts} onClose={() => setShowShortcuts(false)} />
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
