# LangGraph / Dify 薄适配

不做运行时 SDK 注入。导出 JSON → 本仓库 `TraceSession` / JSONL。

## 导入

「导入 JSONL / OTLP / 框架」或加载：

- `public/demo/sample-langgraph.json`
- `public/demo/sample-dify.json`

检测顺序：OTLP → Dify → LangGraph → JSONL。

## LangGraph / LangChain

识别 `runs` / `run_type` / `parent_run_id` 等字段；映射 `chain|llm|tool|retriever`。

## Dify

识别 `workflow_run_id` / `node_type`；knowledge 节点 → `retriever` + `ragChunks`。
