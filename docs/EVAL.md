# 评测（启发式 + 可选 LLM Judge）

## Dataset

JSON 数组或 JSONL，每行：

```json
{"id":"d1","question":"附近有什么场馆？","expected":"球馆","goldSessionId":"可选"}
```

工作台底部 **评测 Eval** → 导入 Dataset。默认按 `question`（或 `goldSessionId`）匹配已加载会话。

## 启发式

综合 error span、RAG 低分片段、引用覆盖、与 `expected` 的粗粒度词重叠 → 0–100 分与 pass/warn/fail。

## LLM-as-judge

勾选 **LLM Judge** 后，使用 Live Run 的 Key（sessionStorage）经 `/opentrace/llm-proxy` 打分；失败时保留启发式结果。结果可导出 MD / CSV。
