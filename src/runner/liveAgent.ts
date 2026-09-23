import type { TraceSession, TraceSpan } from '../types'
import type { LlmConfig } from './config'
import { chatCompletion, chatCompletionStream } from './llm'
import { retrieveLocal } from './rag'
import { toolForecast, toolGeocode, toolRankVenues } from './tools'

const PLAN_SYSTEM =
  '你是工具规划器。只返回 JSON：{"steps":["geocode"|"retrieve"|"forecast"|"rank"|"answer"],"place":"地点名或空","need_weather":true|false}。不要 Markdown。'

const ANSWER_SYSTEM =
  '你是本地生活助手。基于检索证据与工具结果作答，用 [1][2] 标注引用；证据不足时说明不确定处。'

export interface LiveRunHooks {
  onSession: (session: TraceSession) => void
  onSpanUpsert: (sessionId: string, span: TraceSpan) => void
  onAnswer: (sessionId: string, answer: string) => void
  onAnswerDelta?: (sessionId: string, fullText: string) => void
  onProgress?: (label: string) => void
}

function nowId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`
}

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e)
}

export async function runLiveAgent(opts: {
  question: string
  config: LlmConfig
  hooks: LiveRunHooks
  signal?: AbortSignal
  runLabel?: string
}) {
  const { question, config, hooks, signal, runLabel } = opts
  const sessionId = nowId('live')
  const t0 = performance.now()
  const elapsed = () => Math.round(performance.now() - t0)
  const progress = (label: string) => hooks.onProgress?.(label)

  const qShort = `${question.slice(0, 20)}${question.length > 20 ? '…' : ''}`
  const title = runLabel
    ? `${runLabel} · ${qShort}`
    : `Live · ${config.model} · ${qShort}`

  const session: TraceSession = {
    id: sessionId,
    title,
    startedAt: new Date().toISOString(),
    question,
    model: config.model,
    spans: [],
  }
  hooks.onSession(session)

  const upsert = (span: TraceSpan) => hooks.onSpanUpsert(sessionId, span)

  const startSpan = (
    partial: Omit<TraceSpan, 'endMs' | 'status'> & { status?: TraceSpan['status'] },
  ): TraceSpan => {
    const span: TraceSpan = {
      ...partial,
      status: partial.status ?? 'running',
      endMs: partial.startMs,
    }
    upsert(span)
    return span
  }

  const finishSpan = (
    span: TraceSpan,
    patch: Partial<TraceSpan> & { status?: TraceSpan['status'] },
  ) => {
    // Mutate in place so callers' references keep the final status.
    Object.assign(span, patch, {
      status: patch.status ?? 'ok',
      endMs: elapsed(),
    })
    upsert(span)
    return span
  }

  progress('规划中…')
  const root = startSpan({
    id: 'plan',
    name: 'agent.plan',
    kind: 'chain',
    startMs: elapsed(),
    input: { question },
  })

  let planLlm: TraceSpan | null = null
  let ansSpan: TraceSpan | null = null

  try {
    planLlm = startSpan({
      id: 'plan-llm',
      parentId: root.id,
      name: 'llm.plan_steps',
      kind: 'llm',
      startMs: elapsed(),
      input: { model: config.model, task: 'choose tools' },
    })

    progress('LLM 规划工具步骤…')
    let planRes: Awaited<ReturnType<typeof chatCompletion>>
    try {
      planRes = await chatCompletion(
        config,
        [
          { role: 'system', content: PLAN_SYSTEM },
          { role: 'user', content: question },
        ],
        signal,
      )
    } catch (e) {
      const msg = errMsg(e)
      finishSpan(planLlm, { status: 'error', error: msg, output: { failed: true } })
      finishSpan(root, { status: 'error', error: msg })
      throw e
    }

    let plan: { steps?: string[]; place?: string; need_weather?: boolean }
    try {
      plan = JSON.parse(planRes.text.replace(/```json|```/g, '').trim()) as typeof plan
    } catch {
      plan = {
        steps: ['geocode', 'retrieve', 'rank', 'answer'],
        place: '静安寺',
        need_weather: /雨|伞|天气|预报/.test(question),
      }
    }

    finishSpan(planLlm, {
      output: { raw: planRes.text, parsed: plan },
      meta: {
        tokens_in: planRes.usage?.prompt_tokens ?? 0,
        tokens_out: planRes.usage?.completion_tokens ?? 0,
      },
    })

    finishSpan(root, {
      output: { steps: plan.steps, place: plan.place, need_weather: plan.need_weather },
    })

    let geo: { lat: number; lng: number; label: string } | null = null
    let forecast: unknown = null
    let chunks = retrieveLocal(question, 4)
    let stepErrors = 0

    if (plan.steps?.includes('geocode') || plan.place) {
      progress('地理编码…')
      const gSpan = startSpan({
        id: 'geocode',
        parentId: root.id,
        name: 'tool.geocode',
        kind: 'tool',
        startMs: elapsed(),
        input: { address: plan.place || question },
      })
      const g = toolGeocode(plan.place || question)
      if (!g.ok) {
        stepErrors += 1
        finishSpan(gSpan, { status: 'error', error: g.error, output: g })
      } else {
        geo = { lat: g.lat, lng: g.lng, label: g.label }
        finishSpan(gSpan, { output: g })
      }
    }

    {
      progress('检索知识库…')
      const rSpan = startSpan({
        id: 'retrieve',
        parentId: root.id,
        name: 'retriever.local_kb',
        kind: 'retriever',
        startMs: elapsed(),
        input: { query: question, topK: 4 },
      })
      try {
        chunks = retrieveLocal(question, 4)
        if (!chunks.length) {
          stepErrors += 1
          finishSpan(rSpan, {
            status: 'error',
            error: '本地知识库未命中任何片段',
            output: { hits: 0 },
            ragChunks: [],
          })
        } else {
          finishSpan(rSpan, {
            output: { hits: chunks.length },
            ragChunks: chunks,
          })
        }
      } catch (e) {
        stepErrors += 1
        finishSpan(rSpan, {
          status: 'error',
          error: errMsg(e),
          output: { hits: 0 },
        })
      }
    }

    if (plan.need_weather || plan.steps?.includes('forecast')) {
      progress('查询天气（Open-Meteo）…')
      const fSpan = startSpan({
        id: 'forecast',
        parentId: root.id,
        name: 'tool.forecast',
        kind: 'tool',
        startMs: elapsed(),
        input: geo ?? { lat: 31.23, lng: 121.47 },
      })
      try {
        forecast = await toolForecast(geo?.lat ?? 31.23, geo?.lng ?? 121.47, signal)
        finishSpan(fSpan, { output: forecast })
      } catch (e) {
        stepErrors += 1
        finishSpan(fSpan, {
          status: 'error',
          error: errMsg(e),
        })
      }
    }

    if (plan.steps?.includes('rank') || /亲子|公园|生活圈|带娃/.test(question)) {
      progress('排序候选场所…')
      const rankSpan = startSpan({
        id: 'rank',
        parentId: root.id,
        name: 'tool.rank_venues',
        kind: 'tool',
        startMs: elapsed(),
        input: { walk_minutes_lte: 15 },
      })
      const ranked = toolRankVenues(chunks, 15)
      finishSpan(rankSpan, { output: ranked })
    }

    progress('流式生成回答…')
    ansSpan = startSpan({
      id: 'answer',
      parentId: root.id,
      name: 'llm.compose_answer',
      kind: 'llm',
      startMs: elapsed(),
      input: { model: config.model, stream: true },
    })

    const evidenceText = chunks
      .map((c, i) => `[${i + 1}] (${c.score}) ${c.source}: ${c.text}`)
      .join('\n')

    let answerText = ''
    try {
      const streamed = await chatCompletionStream(
        config,
        [
          { role: 'system', content: ANSWER_SYSTEM },
          {
            role: 'user',
            content: [
              `用户问题：${question}`,
              geo ? `地理编码：${JSON.stringify(geo)}` : '',
              forecast ? `天气预报工具：${JSON.stringify(forecast)}` : '',
              stepErrors
                ? `此前有 ${stepErrors} 个步骤失败，回答中请标明不确定处。`
                : '',
              `检索证据：\n${evidenceText || '（无）'}`,
            ]
              .filter(Boolean)
              .join('\n\n'),
          },
        ],
        (delta) => {
          answerText += delta
          hooks.onAnswerDelta?.(sessionId, answerText)
        },
        signal,
      )
      answerText = streamed.text
      finishSpan(ansSpan, {
        output: { text: answerText },
        meta: {
          streamed: true,
          prior_step_errors: stepErrors,
          ...(streamed.usage
            ? {
                tokens_in: streamed.usage.prompt_tokens ?? 0,
                tokens_out: streamed.usage.completion_tokens ?? 0,
              }
            : {}),
        },
      })
    } catch (streamErr) {
      progress('流式失败，改用普通补全…')
      try {
        const ans = await chatCompletion(
          config,
          [
            { role: 'system', content: ANSWER_SYSTEM },
            {
              role: 'user',
              content: [
                `用户问题：${question}`,
                geo ? `地理编码：${JSON.stringify(geo)}` : '',
                forecast ? `天气预报工具：${JSON.stringify(forecast)}` : '',
                `检索证据：\n${evidenceText || '（无）'}`,
              ]
                .filter(Boolean)
                .join('\n\n'),
            },
          ],
          signal,
        )
        answerText = ans.text
        hooks.onAnswerDelta?.(sessionId, answerText)
        finishSpan(ansSpan, {
          output: {
            text: answerText,
            fallback: 'non-stream',
            stream_error: errMsg(streamErr),
          },
          meta: {
            prior_step_errors: stepErrors,
            ...(ans.usage
              ? {
                  tokens_in: ans.usage.prompt_tokens ?? 0,
                  tokens_out: ans.usage.completion_tokens ?? 0,
                }
              : {}),
          },
        })
      } catch (fallbackErr) {
        const msg = errMsg(fallbackErr)
        finishSpan(ansSpan, {
          status: 'error',
          error: msg,
          output: {
            stream_error: errMsg(streamErr),
            fallback_error: msg,
          },
        })
        finishSpan(root, { status: 'error', error: msg })
        throw fallbackErr
      }
    }

    hooks.onAnswer(sessionId, answerText)
    progress(stepErrors ? `完成（${stepErrors} 步曾失败，见红色 span）` : '完成')
    return sessionId
  } catch (e) {
    const msg = errMsg(e)
    if (planLlm?.status === 'running') {
      finishSpan(planLlm, { status: 'error', error: msg })
    }
    if (ansSpan?.status === 'running') {
      finishSpan(ansSpan, { status: 'error', error: msg })
    }
    if (root.status === 'running') {
      finishSpan(root, { status: 'error', error: msg })
    }
    throw e
  }
}
