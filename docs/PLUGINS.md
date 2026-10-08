# Span 渲染插件

按 `kind` 或 `meta.renderHint` / `meta.plugin` 注册自定义详情与时间线条目。

```ts
import { registerSpanRenderer } from './plugins/spanRenderers'

registerSpanRenderer('my-tool', {
  color: 'var(--tool)',
  renderDetail: (span) => <pre>{JSON.stringify(span.output, null, 2)}</pre>,
  renderTimelineChip: (span) => <span className="token-chip">{String(span.meta?.latency ?? '')}</span>,
})
```

`kind: 'custom'` 的 span 可设 `meta.renderHint: 'my-tool'` 走上述渲染器。默认已注册 llm / tool / retriever / chain / custom。
