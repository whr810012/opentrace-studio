# OTLP → OpenTrace

本仓库不跑 OpenTelemetry Collector。只把常见 OTLP Traces JSON（`resourceSpans`）转成 Session。

## 导入

1. `pnpm dev`  
2. 「导入 JSONL / OTLP」  
3. 选 `public/demo/sample-otlp.json`，或自带 `resourceSpans[].scopeSpans[].spans` 的 JSON  

同一入口：含 `resourceSpans` 走 OTLP，否则走 JSONL。

## 映射（子集）

| OTLP | OpenTrace |
|---|---|
| 同一 `traceId` | 一个 Session |
| `spanId` / `parentSpanId` | `id` / `parentId` |
| `start/endTimeUnixNano` | 相对首 span 的 ms |
| `status.code = 2` | `error` |
| `name` + 属性关键词 | `kind` |
| `gen_ai.prompt` 等 | `input` / `output` |

不支持：protobuf、Metrics、Logs、完整 Collector。

已加厚：OpenInference `openinference.span.kind`、更多 GenAI usage / IO / 检索文档索引属性。

## 本地 ingest（开发态薄桥）

`pnpm dev` 后：

1. 顶栏 **监听本地 OTLP**
2. `POST /opentrace/v1/traces`（或 `/v1/traces`）发送 OTLP JSON
3. 前端每 2.5s 拉取 `/opentrace/otlp-ingest/buffer?drain=1` 并导入

这不是 Collector，仅内存环形缓冲（约 20 条）。

## 离线样例

API 不可用时导入 `public/demo/offline-pitch.jsonl` 即可回放。
