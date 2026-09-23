# 对比说明

## 结论

「Agent 能返回过程」只说明有数据。OpenTrace Studio 把过程做成可点选、可核对证据、可回放、可本机部署的工作台。

**定位边界：** 不替代 Langfuse / LangSmith 等生产级可观测平台；补的是**轻量本机 DevTools + Live Run + RAG 证据链**。

## 对照

| 维度 | 过程 / 日志 | 云可观测（如 LangSmith） | 开源平台（如 Langfuse） | OpenTrace Studio |
|---|---|---|---|---|
| 用户 | 临时查看 | 线上排障 | 生产自托管 | 开发、教学、开源评审 |
| 可视化 | 弱 | 强 | 强 | 时间线 / DAG / 瀑布 / 证据 / 回放 |
| RAG 证据 | 少见 | 视产品 | 视配置 | 挂在 retriever span + 质检快照 |
| 自托管 | 通常无工作台 | 多为 SaaS | 需较重基建 | Apache-2.0，`pnpm dev` 即可 |
| 演示 | 差 | 要账号环境 | 要部署 | 本机真跑或离线样例 |
| 接入 | 格式不一 | 平台 SDK | OTel / SDK | JSONL + Live Run + OTLP 薄导入 |

## 相近开源项目（参考）

| 项目 | 相近点 | 差异 |
|---|---|---|
| [AgentPrism](https://github.com/evilmartians/agent-prism) | React Trace 可视化 | 组件库；无内置 Live Run / RAG 快照 |
| [Lookspan](https://github.com/JoniMartin27/lookspan) | 本地 OTLP 仪表盘 | 偏接收服务；非页内 Agent 真跑工作台 |
| [Arize Phoenix](https://github.com/Arize-ai/phoenix) | 本地 eval / RAG | 偏评测平台（ELv2）；我们偏交互调试闭环 |

## 和「返回过程」的差别

1. 人可以点选、筛选、回放，而不只是读文本  
2. 常能看到完整入参 / 出参与检索原文  
3. JSONL 可导出、可复现；RAG 快照可核对引用  
4. Agent 负责答题；本仓库负责观测与调试  

## 一句话

OpenTrace Studio 是 Agent / RAG 的本机 DevTools：不替代 Agent，也不替代生产观测平台，只把过程看清楚。
