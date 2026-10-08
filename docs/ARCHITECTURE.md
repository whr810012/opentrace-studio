# Architecture

## 目标

薄后端：浏览器完成 Agent / RAG 观测闭环，方便演示与二次接入。

## 数据流

```mermaid
flowchart LR
  LiveRun[LiveAgent_Runner] -->|spans_and_stream| Store[Sessions_Memory_and_LocalStorage]
  Producer[External_Agent] -->|JSONL_or_OTLP_JSON| Adapter[jsonl_and_otlp_lite]
  Adapter --> Store
  Store --> Export[Export_JSONL]
  Store --> Timeline
  Store --> CallGraph
  Store --> Evidence
  Replay[ReplayControls] --> Timeline
  LiveRun --> LLM[OpenAI_Compatible_API]
  LiveRun --> Meteo[Open_Meteo]
  LiveRun --> LocalKB[Local_RAG]
```

1. Live Run：`src/runner/liveAgent.ts` 边跑边写 span，答案走 SSE  
2. 导入导出：`parseJsonl` / `sessionToJsonl`  
3. 持久化：`src/storage/sessions.ts`（最多 20 条）  
4. 视图用 `selectedId` / `replayIndex` 联动  

## 模块

| 模块 | 职责 |
|---|---|
| `src/types.ts` | 协议类型 |
| `src/adapter/jsonl.ts` | 解析、导出、Diff |
| `src/adapter/otlp-lite.ts` | OTLP JSON 子集 → Session |
| `src/components/*` | 时间线、图、证据、回放 |
| `src/App.tsx` | 会话与导入 |

## 取舍

- MVP 不堆重后端，先把可视化做完整  
- JSONL 先跑通接入，再扩框架 SDK  
- 回放用 `endMs` 过滤未到达节点，不做复杂状态机  

## 扩展（v0.4 已落地）

- 本地 OTLP JSON ingest（`vite.otlp-ingest.ts`）  
- Timeline / Waterfall 虚拟化与 CallGraph 分层  
- LangGraph / Dify 离线适配、评测面板、span 渲染插件  

仍不做：完整 Collector / protobuf / Metrics / Logs / 账号体系。
